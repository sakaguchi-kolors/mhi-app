// ETL/再計算のCLIエントリ。プロトタイプ etl.ts 末尾の直接実行部を移植。
// 本番は Windows タスクスケジューラが `npm run etl`（= このスクリプト）を定期起動する。
//   npm run etl            … CSV取込＋算出＋DB洗い替え（runEtl）
//   npm run etl -- --dry   … DBに触れず集計サマリのみ
//   npm run recompute      … CSVを読まず算出のみ（recompute）
import { loadEnv } from '../config/load-env';
loadEnv();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { EtlService } from '../etl/etl.service';

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry');
  const recompute = process.argv.includes('--recompute');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const etl = app.get(EtlService);
  if (recompute) await etl.recompute();
  else await etl.runEtl({ dry, user: 'etl-cli' });
  await app.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
