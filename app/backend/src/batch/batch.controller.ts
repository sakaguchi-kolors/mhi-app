// 一括処理エンドポイント：再計算（マスタ編集の算出反映）と担当者の自動割り当て。
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { EtlService } from '../etl/etl.service';
import { AssignService } from '../assign/assign.service';
import { AuditService } from '../audit/audit.service';
import { appUser } from '../common/app-user';
import { Roles } from '../auth/auth.decorators';

@Roles('管理者')
@Controller()
export class BatchController {
  constructor(
    private readonly etl: EtlService,
    private readonly assign: AssignService,
    private readonly audit: AuditService,
  ) {}

  // 再計算（CSVは読まずDB上の取込済みデータから算出のみ＝高速）
  @Post('recompute')
  async recompute(@Req() req: Request): Promise<{ ok: true; parts: number; timeline: number }> {
    const summary = await this.etl.recompute();
    await this.audit.record(appUser(req), 'recompute', 'batch', '-', null, summary);
    return { ok: true, ...summary };
  }

  // 担当者の自動割り当て（未割当のみ対象。既存は上書きしない）
  @Post('assign/auto')
  async assignAuto(@Req() req: Request, @Body() _body: unknown): Promise<{ ok: true } & Record<string, unknown>> {
    const summary = await this.assign.autoAssign();
    await this.audit.record(appUser(req), 'assign.auto', 'batch', '-', null, summary);
    return { ok: true, ...summary };
  }
}
