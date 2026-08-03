// 一括処理エンドポイント：再計算（マスタ編集の算出反映）と担当者の自動割り当て。
import { Body, ConflictException, Controller, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { EtlService } from '../etl/etl.service';
import type { ColorCounts } from '../etl/etl-types';
import { BatchLockService } from '../etl/batch-lock.service';
import { AssignService } from '../assign/assign.service';
import { AuditService } from '../audit/audit.service';
import { PartsService } from '../parts/parts.service';
import { appUser } from '../common/app-user';
import { Roles } from '../auth/auth.decorators';

@Roles('管理者')
@Controller()
@ApiTags('batch')
@ApiCookieAuth('mhi_token')
export class BatchController {
  constructor(
    private readonly etl: EtlService,
    private readonly batchLock: BatchLockService,
    private readonly assign: AssignService,
    private readonly audit: AuditService,
    private readonly parts: PartsService,
  ) {}

  // 再計算（CSVは読まずDB上の取込済みデータから算出のみ＝高速）
  @Post('recompute')
  async recompute(
    @Req() req: Request,
  ): Promise<{ ok: true; parts: number; timeline: number; colors: ColorCounts }> {
    if (this.batchLock.isLocked()) {
      throw new ConflictException('バッチ処理が実行中です');
    }
    const summary = await this.etl.recompute();
    this.parts.clearCache();
    await this.audit.record(appUser(req), 'recompute', 'batch', '-', null, summary);
    return { ok: true, ...summary, colors: summary.colors ?? { green: 0, yellow: 0, red: 0 } };
  }

  // 担当者の自動割り当て（未割当のみ対象。既存は上書きしない）
  @Post('assign/auto')
  async assignAuto(@Req() req: Request, @Body() _body: unknown): Promise<{ ok: true } & Record<string, unknown>> {
    const summary = await this.assign.autoAssign();
    await this.audit.record(appUser(req), 'assign.auto', 'batch', '-', null, summary);
    return { ok: true, ...summary };
  }
}
