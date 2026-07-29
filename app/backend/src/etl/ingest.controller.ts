import { Controller, Get, Post, Req, Res, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { IngestService, type IngestInfo, type StartResult, type UploadResult } from './ingest.service';
import { appUser } from '../common/app-user';
import { Roles } from '../auth/auth.decorators';
import { IngestUploadInterceptor, ingestUploadKeyFromRequest } from './ingest-upload.interceptor';

@Roles('管理者')
@Controller('ingest')
@ApiTags('ingest')
@ApiCookieAuth('mhi_token')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  // フォルダ内ファイル一覧＋プリフライト＋ジョブ状態（フロントはこれをポーリング）
  @Get()
  info(): Promise<IngestInfo> {
    return this.ingest.ingestInfo();
  }

  // 取込開始（プリフライトNGは422、実行中は409）。runEtlは非同期実行し状態はGETで見せる
  @Post()
  async start(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<StartResult> {
    const r = await this.ingest.startIngest(appUser(req));
    if (!r.started) res.status(r.reason === 'busy' ? 409 : 422);
    return r;
  }

  // 大容量CSV向け: 1ファイルずつ CSV_DIR にディスク直書き（取込実行は POST /ingest）
  @Post('upload/:key')
  @UseInterceptors(IngestUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'key', enum: ['flexsche', 'pbs', 'octopus', 'shopMaster'] })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  upload(@Req() req: Request): Promise<UploadResult> {
    const key = ingestUploadKeyFromRequest(req);
    return this.ingest.saveUpload(key, req.file!, appUser(req));
  }
}
