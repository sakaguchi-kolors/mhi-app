// アプリ設定（プロトタイプ config.ts 相当）。環境変数を型付きで一元管理する。
// .env は load-env.ts が process.env に読み込む（main.ts / CLI 先頭）。
import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { isYmd, localYmd } from '../shared/dates';

const env = (k: string, d: string): string => process.env[k] ?? d;
const num = (k: string, d: number): number => Number(process.env[k] ?? d);

@Injectable()
export class AppConfigService {
  /** 取込元CSVフォルダの絶対パス（実行時の cwd = app/backend 基準） */
  readonly csvDir = path.resolve(process.cwd(), env('CSV_DIR', '../sample-data'));

  /** env AS_OF（開発・テスト用。本番は AsOfService が DB 保存値を優先） */
  get asOfEnv(): string | null {
    const v = process.env.AS_OF?.trim();
    return v && isYmd(v) ? v : null;
  }

  /** 起動ログ等用。DB 未参照のフォールバック */
  get asOf(): string {
    return this.asOfEnv ?? localYmd();
  }

  readonly shopLtDays = num('SHOP_LT_DAYS', 4);
  readonly milestoneLtDays = num('MILESTONE_LT_DAYS', 5);
  readonly stagnantThreshold = num('STAGNANT_THRESHOLD', 10);
  readonly apiPort = num('API_PORT', 8787);

  /** 取込ジョブ状態ファイル */
  readonly ingestJobFile = path.resolve(process.cwd(), env('INGEST_JOB_FILE', 'data/ingest-job.json'));

  /** 自動取込スケジュール（時刻指定） */
  readonly ingestScheduleFile = path.resolve(process.cwd(), env('INGEST_SCHEDULE_FILE', 'data/ingest-schedule.json'));

  /** CSVアップロード1ファイルあたりの上限（MB）。OCTPuS は 1.8GB 規模になり得る */
  readonly ingestUploadMaxMb = num('INGEST_UPLOAD_MAX_MB', 4096);
  readonly ingestUploadMaxBytes = this.ingestUploadMaxMb * 1024 * 1024;

  /** アップロード／取込 HTTP タイムアウト（ms）。大容量転送・ETL 用 */
  readonly ingestUploadTimeoutMs = num('INGEST_UPLOAD_TIMEOUT_MS', 30 * 60 * 1000);

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
