import { Body, Controller, Get, Post, Put, Req, Res, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsString } from 'class-validator';
import type { Request, Response } from 'express';
import { IngestService, type IngestInfo, type StartResult, type UploadResult } from './ingest.service';
import { IngestScheduleService } from './ingest-schedule.service';
import { AuditService } from '../audit/audit.service';
import { appUser } from '../common/app-user';
import { Roles } from '../auth/auth.decorators';
import { IngestUploadInterceptor, ingestUploadKeyFromRequest } from './ingest-upload.interceptor';
import type { IngestSchedule } from '../shared/types';

class IngestScheduleBodyDto {
  @IsBoolean()
  enabled!: boolean;

  @IsArray()
  @IsString({ each: true })
  times!: string[];
}

@Roles('管理者')
@Controller('ingest')
@ApiTags('ingest')
@ApiCookieAuth('mhi_token')
export class IngestController {
  constructor(
    private readonly ingest: IngestService,
    private readonly schedule: IngestScheduleService,
    private readonly audit: AuditService,
  ) {}

  // フォルダ内ファイル一覧＋プリフライト＋ジョブ状態＋自動取込スケジュール（フロントはこれをポーリング）
  @Get()
  async info(): Promise<IngestInfo> {
    const info = await this.ingest.ingestInfo();
    return { ...info, schedule: this.schedule.getPublic() };
  }

  @Put('schedule')
  async saveSchedule(
    @Req() req: Request,
    @Body() body: IngestScheduleBodyDto,
  ): Promise<IngestSchedule> {
    const user = appUser(req);
    const saved = this.schedule.save(body, user);
    await this.audit.record(user, 'ingest.schedule', 'batch', '-', null, {
      enabled: saved.enabled,
      times: saved.times,
    });
    return saved;
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
