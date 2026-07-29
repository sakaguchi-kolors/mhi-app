import { loadEnv } from './config/load-env';
loadEnv(); // Prisma/Config が参照する前に .env を反映

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(cookieParser()); // 認証Cookie(mhi_token)の読み取り

  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api'); // すべてのAPIは /api/* 配下
  setupSwagger(app);

  // フロント(React/Vite)の静的成果物を配信（単一サーバ確認モード用）。
  const webDir = path.resolve(process.cwd(), '..', 'frontend', 'dist');
  if (fs.existsSync(webDir)) {
    app.useStaticAssets(webDir);
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(webDir, 'index.html'), (err: Error | null) => (err ? next(err) : undefined));
    });
  }

  const config = app.get(AppConfigService);
  await app.listen(config.apiPort);
  console.log(`[api] http://localhost:${config.apiPort}  (asOf=${config.asOf})`);
}
void bootstrap();
