// アプリ設定（プロトタイプ config.ts 相当）。環境変数を型付きで一元管理する。
// .env は load-env.ts が process.env に読み込む（main.ts / CLI 先頭）。
import { Injectable } from '@nestjs/common';
import path from 'node:path';

const env = (k: string, d: string): string => process.env[k] ?? d;
const num = (k: string, d: number): number => Number(process.env[k] ?? d);

function localYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

@Injectable()
export class AppConfigService {
  /** 取込元CSVフォルダの絶対パス（実行時の cwd = app/backend 基準） */
  readonly csvDir = path.resolve(process.cwd(), env('CSV_DIR', '../sample-data'));

  /** 基準日(as-of)。AS_OF 未設定時は呼び出し時点のローカル日付 */
  get asOf(): string {
    return env('AS_OF', localYmd());
  }

  readonly shopLtDays = num('SHOP_LT_DAYS', 4);
  readonly milestoneLtDays = num('MILESTONE_LT_DAYS', 5);
  readonly stagnantThreshold = num('STAGNANT_THRESHOLD', 10);
  readonly dueSource = env('DUE_SOURCE', 'flexsche') as 'flexsche' | 'pbs';
  readonly apiPort = num('API_PORT', 8787);

  /** 取込ジョブ状態ファイル */
  readonly ingestJobFile = path.resolve(process.cwd(), env('INGEST_JOB_FILE', 'data/ingest-job.json'));

  /** 取込ファイル名。既定は提供データの名称。収集バッチで変わる場合は env で上書き可。 */
  readonly files = {
    flexsche: env('FILE_FLEXSCHE', 'FLEXSCHE結果出力5(残工程数見直し).csv'),
    octopus: env('FILE_OCTOPUS', 'OCTPuS工程実績.csv'),
    pbs: env('FILE_PBS', 'PBS部品計画納期リスト.csv'),
    shopMaster: env('FILE_SHOP_MASTER', 'SHOP_JOBマスタ.csv'),
  };

  /** as-of を Date で取得（0時） */
  get asOfDate(): Date {
    return new Date(this.asOf + 'T00:00:00');
  }
}
