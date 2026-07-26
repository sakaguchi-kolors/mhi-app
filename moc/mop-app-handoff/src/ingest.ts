// 指定フォルダ(CSV_DIR)からの取込：プリフライト＋非同期ジョブ＋状態管理。
// 取込本体は runEtl() を共有し、手動UI取込と将来の定期実行(タスクスケジューラ)で
// 同一コアを使う（差はトリガーのみ）。破壊的操作なので呼び出し側で管理者に限定する。
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, FILES } from './config.ts';
import { readCsvHeader } from './csv.ts';
import { runEtl } from './etl.ts';
import { q } from './db.ts';

// 各取込ファイルと、ヘッダに最低限必要なカラム。
// フォーマット違い・エンコーディング取り違え（例: CP932/UTF-8）を取込前に弾くための軽量検証。
const EXPECTED: { file: string; required: string[] }[] = [
  { file: FILES.flexsche, required: ['OS_ID', '部品番号', '工程NO', 'SHOP', 'JND(計算)'] },
  { file: FILES.pbs, required: ['OS_ID', '計画納期'] },
  { file: FILES.octopus, required: ['OS_ID', 'SHOP'] },
  { file: FILES.shopMaster, required: ['SHOP', '作業名称'] },
];

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

let currentJob: IngestJob | null = null; // 実行中（同時実行ロック）
let lastJob: IngestJob | null = null; // 直近の完了/失敗

async function inspectFiles(): Promise<IngestFileInfo[]> {
  const dir = CONFIG.csvDir;
  const out: IngestFileInfo[] = [];
  for (const { file, required } of EXPECTED) {
    const full = path.join(dir, file);
    const info: IngestFileInfo = {
      name: file, exists: false, size: 0, mtime: null, encoding: null,
      requiredOk: false, missing: required.slice(), error: null,
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

function preflightOk(files: IngestFileInfo[]): boolean {
  return files.length > 0 && files.every((f) => f.exists && f.requiredOk);
}

export async function ingestInfo(): Promise<IngestInfo> {
  const files = await inspectFiles();
  return { dir: CONFIG.csvDir, files, preflightOk: preflightOk(files), job: currentJob ?? lastJob };
}

async function colorCounts(): Promise<{ red: number; yellow: number; green: number }> {
  const rows = (await q<{ color: string; n: string }>(
    `SELECT color, count(*)::text AS n FROM t_part_status GROUP BY color`,
  )).rows;
  const c: { red: number; yellow: number; green: number } = { red: 0, yellow: 0, green: 0 };
  for (const r of rows) if (r.color === 'red' || r.color === 'yellow' || r.color === 'green') c[r.color] = Number(r.n);
  return c;
}

type AuditFn = (user: string, action: string, target: string, ref: string, before: unknown, after: unknown) => Promise<void>;

export interface StartResult {
  started: boolean;
  reason?: 'busy' | 'preflight';
  job?: IngestJob;
  files?: IngestFileInfo[];
}

/**
 * 取込ジョブを起動する。プリフライトNGなら起動せずに理由を返す。
 * runEtl は約2分かかるためレスポンスは即返し、進捗は ingestInfo() のジョブ状態で見せる。
 */
export async function startIngest(user: string, audit: AuditFn): Promise<StartResult> {
  if (currentJob) return { started: false, reason: 'busy', job: currentJob };
  const files = await inspectFiles();
  if (!preflightOk(files)) return { started: false, reason: 'preflight', files };

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
  currentJob = job;

  // バックグラウンド実行（レスポンスは即返す）。完了時に状態と監査ログを更新。
  void (async () => {
    try {
      const summary = await runEtl();
      job.result = { parts: summary.parts, timeline: summary.timeline, colors: await colorCounts() };
      job.state = 'done';
      await audit(user, 'ingest', 'batch', CONFIG.csvDir, null, job.result);
    } catch (e) {
      job.state = 'error';
      job.error = e instanceof Error ? e.message : String(e);
      await audit(user, 'ingest.error', 'batch', CONFIG.csvDir, null, { error: job.error }).catch(() => {});
    } finally {
      job.finishedAt = new Date().toISOString();
      job.elapsedMs = Date.now() - startedAt.getTime();
      lastJob = job;
      currentJob = null;
    }
  })();

  return { started: true, job };
}
