// 大容量CSV向け: multer をディスク直書き（メモリに載せない）で1ファイルずつ受け取る。
import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import multer, { MulterError } from 'multer';
import { Observable, from, switchMap } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';
import { type IngestUploadKey, isIngestUploadKey } from './ingest-upload.constants';

@Injectable()
export class IngestUploadInterceptor implements NestInterceptor {
  constructor(private readonly config: AppConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.params['key'];
    if (!key || !isIngestUploadKey(key)) {
      throw new BadRequestException(`upload key は ${['flexsche', 'pbs', 'octopus', 'shopMaster'].join(', ')} のいずれかです`);
    }

    const upload = multer({
      storage: multer.diskStorage({
        destination: (_r, _f, cb) => {
          fs.mkdirSync(this.config.csvDir, { recursive: true });
          cb(null, this.config.csvDir);
        },
        filename: (_r, file, cb) => {
          if (!file.originalname.toLowerCase().endsWith('.csv')) {
            cb(new BadRequestException(`${key}: CSVファイル(.csv)を指定してください`), '');
            return;
          }
          cb(null, `.ingest-${key}-${Date.now()}.uploading`);
        },
      }),
      limits: { fileSize: this.config.ingestUploadMaxBytes },
    }).single('file');

    return from(
      new Promise<void>((resolve, reject) => {
        upload(req, res, (err: unknown) => {
          if (err instanceof MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              reject(
                new PayloadTooLargeException(
                  `ファイルサイズ上限（${this.config.ingestUploadMaxMb} MB）を超えています`,
                ),
              );
              return;
            }
            reject(new BadRequestException(err.message));
            return;
          }
          if (err) {
            reject(err);
            return;
          }
          if (!req.file) {
            reject(new BadRequestException('file フィールドに CSV を指定してください'));
            return;
          }
          resolve();
        });
      }),
    ).pipe(switchMap(() => next.handle()));
  }
}

/** ルート param の key を型付きで取り出す */
export function ingestUploadKeyFromRequest(req: Request): IngestUploadKey {
  const key = req.params['key'];
  if (!key || !isIngestUploadKey(key)) {
    throw new BadRequestException('invalid upload key');
  }
  return key;
}
