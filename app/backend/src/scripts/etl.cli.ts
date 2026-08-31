// ETL/再計算のCLIエントリ。プロトタイプ etl.ts 末尾の直接実行部を移植。
// 本番の定期取込はアプリ常駐プロセスの自動取込（データ取込画面で時刻指定）が主。
// 手動・緊急時は `npm run etl` でも同じ runEtl を実行できる。
//   npm run etl            … CSV取込＋算出＋DB洗い替え（runEtl）＋実績LT集計
//   npm run etl -- --dry   … DBに触れず集計サマリのみ
//   npm run recompute      … CSVを読まず算出のみ（recompute）
//   npm run lt             … 実績LT集計のみ
import { loadEnv } from '../config/load-env';
loadEnv();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { EtlService } from '../etl/etl.service';
import { LtService } from '../lt/lt.service';

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry');
  const recompute = process.argv.includes('--recompute');
  const ltOnly = process.argv.includes('--lt');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  if (ltOnly) {
    await app.get(LtService).recompute();
  } else if (recompute) {
    await app.get(EtlService).recompute();
  } else {
    await app.get(EtlService).runEtl({ dry, user: 'etl-cli' });
    // 実績LTは JND(実績) が更新されたときだけ変わるので、取込直後に集計し直す
    if (!dry) await app.get(LtService).recompute();
  }
  await app.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
