// 指定フォルダ(CSV_DIR)からの取込：プリフライト＋非同期ジョブ＋状態管理。
// 取込本体は EtlService.runEtl() を共有し、手動UI取込と将来の定期実行(タスクスケジューラ)で
// 同一コアを使う（差はトリガーのみ）。破壊的操作なので呼び出し側で管理者に限定する。
import { Injectable } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EtlService } from './etl.service';
import { readCsvHeader } from './csv';

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
export class IngestService {
  private currentJob: IngestJob | null = null; // 実行中（同時実行ロック）
  private lastJob: IngestJob | null = null; // 直近の完了/失敗

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly etl: EtlService,
    private readonly audit: AuditService,
  ) {}

  // 各取込ファイルと、ヘッダに最低限必要なカラム。
  // フォーマット違い・エンコーディング取り違えを取込前に弾くための軽量検証。
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

  /**
   * 取込ジョブを起動する。プリフライトNGなら起動せずに理由を返す。
   * runEtl は時間がかかるためレスポンスは即返し、進捗は ingestInfo() のジョブ状態で見せる。
   */
  async startIngest(user: string): Promise<StartResult> {
    if (this.currentJob) return { started: false, reason: 'busy', job: this.currentJob };
    const files = await this.inspectFiles();
    if (!this.preflightOk(files)) return { started: false, reason: 'preflight', files };

    const startedAt = new Date();
    const job: IngestJob = {
      id: `ingest-${startedAt.getTime()}`,
      user,
      state: 'running',
      startedAt: startedAt.toISOString(),
      finishedAt: null,
      elapsedMs: null,
      result: null,
      error: null,
    };
    this.currentJob = job;

    // バックグラウンド実行（レスポンスは即返す）。完了時に状態と監査ログを更新。
    void (async () => {
      try {
        const summary = await this.etl.runEtl();
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
      }
    })();

    return { started: true, job };
  }
}
