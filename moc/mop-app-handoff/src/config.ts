// 環境変数の読み込み（.env を簡易パース。外部依存を増やさないため dotenv は使わない）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv();

const env = (k: string, d: string) => process.env[k] ?? d;
const num = (k: string, d: number) => Number(process.env[k] ?? d);

export const CONFIG = {
  pg: {
    host: env('PGHOST', 'localhost'),
    port: num('PGPORT', 5432),
    user: env('PGUSER', 'mop'),
    password: env('PGPASSWORD', 'mop_local_pw'),
    database: env('PGDATABASE', 'mop'),
  },
  csvDir: path.resolve(ROOT, env('CSV_DIR', './sample-data')),
  asOf: env('AS_OF', new Date().toISOString().slice(0, 10)),
  shopLtDays: num('SHOP_LT_DAYS', 4),
  milestoneLtDays: num('MILESTONE_LT_DAYS', 5),
  stagnantThreshold: num('STAGNANT_THRESHOLD', 10),
  dueSource: env('DUE_SOURCE', 'flexsche') as 'flexsche' | 'pbs',
  apiPort: num('API_PORT', 8787),
  webPort: num('WEB_PORT', 8080),
};

// 取込ファイル名。既定は現時点の提供データの名称に合わせてある（sample-data も同名）。
// 将来の収集バッチ等でファイル名が変わる場合は env で上書きできる（コード無改修）。
export const FILES = {
  flexsche: env('FILE_FLEXSCHE', 'FLEXSCHE結果出力5(残工程数見直し).csv'),
  octopus: env('FILE_OCTOPUS', 'OCTPuS工程実績.csv'),
  pbs: env('FILE_PBS', 'PBS部品計画納期リスト.csv'),
  shopMaster: env('FILE_SHOP_MASTER', 'SHOP_JOBマスタ.csv'),
};
