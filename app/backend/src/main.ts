import { loadEnv } from './config/load-env';
loadEnv(); // Prisma/Config が参照する前に .env を反映

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(cookieParser()); // 認証Cookie(mhi_token)の読み取り
  app.enableCors({ origin: true, credentials: true }); // Cookie認証のため資格情報を許可
  app.setGlobalPrefix('api'); // すべてのAPIは /api/* 配下

  // フロント(React/Vite)の静的成果物を配信（単一サーバ確認モード用）。
  // 本番は web 成果物を IIS で配信するため、この静的配信は使わない。
  const webDir = path.resolve(process.cwd(), '..', 'frontend', 'dist');
  app.useStaticAssets(webDir);
  // SPA: /parts/xxx 等を直接開いたとき index.html を返す（API以外のGET）
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDir, 'index.html'), (err: Error | null) => (err ? next(err) : undefined));
  });

  const config = app.get(AppConfigService);
  await app.listen(config.apiPort);
  // eslint-disable-next-line no-console
  console.log(`[api] http://localhost:${config.apiPort}  (asOf=${config.asOf})`);
}
void bootstrap();
