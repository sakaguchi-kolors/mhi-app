import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { IngestService, type IngestInfo, type StartResult } from './ingest.service';
import { appUser } from '../common/app-user';
import { Roles } from '../auth/auth.decorators';

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
}
