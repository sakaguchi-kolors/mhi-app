// 指定フォルダ(CSV_DIR)からの取込：プリフライト＋非同期ジョブ＋状態管理。
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EtlService } from './etl.service';
import { BatchLockService } from './batch-lock.service';
import { readCsvHeader } from './csv';
import { IngestJobStore } from './ingest-job.store';

export interface IngestFileInfo {
  name: string;
  exists: boolean;
  size: number;
  mtime: string | null;
  encoding: string | null;
  requiredOk: boolean;
  missing: string[];
  error: string | null;
}
export interface IngestResult {
  parts: number;
  timeline: number;
  colors: { red: number; yellow: number; green: number };
}
export interface IngestJob {
  id: string;
  user: string;
  state: 'running' | 'done' | 'error';
  startedAt: string;
  finishedAt: string | null;
  elapsedMs: number | null;
  result: IngestResult | null;
  error: string | null;
}
export interface IngestInfo {
  dir: string;
  files: IngestFileInfo[];
  preflightOk: boolean;
  job: IngestJob | null;
}
export interface StartResult {
  started: boolean;
  reason?: 'busy' | 'preflight';
  job?: IngestJob;
  files?: IngestFileInfo[];
}

@Injectable()
export class IngestService implements OnModuleInit {
  private readonly logger = new Logger('Ingest');
  private readonly store: IngestJobStore;
  private currentJob: IngestJob | null = null;
  private lastJob: IngestJob | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly etl: EtlService,
    private readonly audit: AuditService,
    private readonly batchLock: BatchLockService,
  ) {
    this.store = new IngestJobStore(this.config.ingestJobFile);
  }

  onModuleInit(): void {
    const { current, last } = this.store.load();
    if (current?.state === 'running') {
      const recovered: IngestJob = {
        ...current,
        state: 'error',
        error: 'サーバー再起動により中断されました',
        finishedAt: new Date().toISOString(),
        elapsedMs: Date.now() - new Date(current.startedAt).getTime(),
      };
      this.lastJob = recovered;
      this.currentJob = null;
      this.persist();
      this.logger.warn(`前回の取込ジョブ ${current.id} は再起動で中断されました`);
      return;
    }
    this.currentJob = current;
    this.lastJob = last;
  }

  private persist(): void {
    this.store.save(this.currentJob, this.lastJob);
  }

  private expected(): { file: string; required: string[] }[] {
    const f = this.config.files;
    return [
      { file: f.flexsche, required: ['OS_ID', '部品番号', '工程NO', 'SHOP', 'JND(計算)'] },
      { file: f.pbs, required: ['OS_ID', '計画納期'] },
      { file: f.octopus, required: ['OS_ID', 'SHOP'] },
      { file: f.shopMaster, required: ['SHOP', '作業名称'] },
    ];
  }

  private async inspectFiles(): Promise<IngestFileInfo[]> {
    const dir = this.config.csvDir;
    const out: IngestFileInfo[] = [];
    for (const { file, required } of this.expected()) {
      const full = path.join(dir, file);
      const info: IngestFileInfo = {
        name: file,
        exists: false,
        size: 0,
        mtime: null,
        encoding: null,
        requiredOk: false,
        missing: required.slice(),
        error: null,
      };
      try {
        const st = fs.statSync(full);
        info.exists = true;
        info.size = st.size;
        info.mtime = st.mtime.toISOString();
        const { encoding, columns } = await readCsvHeader(dir, file);
        info.encoding = encoding;
        const set = new Set(columns);
        info.missing = required.filter((c) => !set.has(c));
        info.requiredOk = info.missing.length === 0;
      } catch (e) {
        info.error = e instanceof Error ? e.message : String(e);
      }
      out.push(info);
    }
    return out;
  }

  private preflightOk(files: IngestFileInfo[]): boolean {
    return files.length > 0 && files.every((f) => f.exists && f.requiredOk);
  }

  async ingestInfo(): Promise<IngestInfo> {
    const files = await this.inspectFiles();
    return { dir: this.config.csvDir, files, preflightOk: this.preflightOk(files), job: this.currentJob ?? this.lastJob };
  }

  private async colorCounts(): Promise<{ red: number; yellow: number; green: number }> {
    const rows = await this.prisma.partStatus.groupBy({ by: ['color'], _count: { color: true } });
    const c = { red: 0, yellow: 0, green: 0 };
    for (const r of rows) {
      if (r.color === 'red' || r.color === 'yellow' || r.color === 'green') c[r.color] = r._count.color;
    }
    return c;
  }

  async startIngest(user: string): Promise<StartResult> {
    if (this.currentJob || this.batchLock.isLocked()) {
      return { started: false, reason: 'busy', job: this.currentJob ?? undefined };
    }

    const startedAt = new Date();
    const placeholder: IngestJob = {
      id: `ingest-${startedAt.getTime()}`,
      user,
      state: 'running',
      startedAt: startedAt.toISOString(),
      finishedAt: null,
      elapsedMs: null,
      result: null,
      error: null,
    };
    this.currentJob = placeholder;
    this.persist();

    const files = await this.inspectFiles();
    if (!this.preflightOk(files)) {
      this.currentJob = null;
      this.persist();
      return { started: false, reason: 'preflight', files };
    }

    const job = this.currentJob;

    void (async () => {
      try {
        const summary = await this.etl.runEtl({ user });
        job.result = { parts: summary.parts, timeline: summary.timeline, colors: await this.colorCounts() };
        job.state = 'done';
        await this.audit.record(user, 'ingest', 'batch', this.config.csvDir, null, job.result);
      } catch (e) {
        job.state = 'error';
        job.error = e instanceof Error ? e.message : String(e);
        await this.audit
          .record(user, 'ingest.error', 'batch', this.config.csvDir, null, { error: job.error })
          .catch(() => {});
      } finally {
        job.finishedAt = new Date().toISOString();
        job.elapsedMs = Date.now() - startedAt.getTime();
        this.lastJob = job;
        this.currentJob = null;
        this.persist();
      }
    })();

    return { started: true, job };
  }
}
