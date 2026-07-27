import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuditService, type AuditSearchResult, type AuditRow } from './audit.service';
import { Roles } from '../auth/auth.decorators';

@Roles('管理者')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** 監査ログ（target/ref/期間/操作種別で絞り込み。format=csv で CSV 出力） */
  @Get()
  async list(
    @Query('target') target?: string,
    @Query('ref') ref?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('actionPrefix') actionPrefix?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('format') format?: string,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<AuditRow[] | AuditSearchResult | string> {
    const parsedPage = page ? Number(page) : undefined;
    const parsedPageSize = pageSize ? Number(pageSize) : undefined;
    const hasFilter = target || ref || from || to || actionPrefix;

    const query = {
      target,
      ref,
      from,
      to,
      actionPrefix: actionPrefix ?? (format === 'csv' || hasFilter ? 'master.' : undefined),
    };

    if (format === 'csv') {
      const rows = await this.audit.findAllForExport(query);
      const csv = this.audit.exportCsv(rows);
      const fname = `master-history_${from ?? 'all'}_${to ?? 'all'}.csv`;
      res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res!.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      return csv;
    }

    if (hasFilter) {
      return this.audit.findPage({
        ...query,
        page: parsedPage,
        pageSize: parsedPageSize,
      });
    }
    return this.audit.recent();
  }
}
