import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditService, type AuditSearchResult, type AuditRow } from './audit.service';
import { Roles } from '../auth/auth.decorators';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertYmd(label: string, v?: string): void {
  if (v != null && v !== '' && !DATE_RE.test(v)) {
    throw new BadRequestException(`${label}はYYYY-MM-DD形式で指定してください`);
  }
}

function sanitizeFilenamePart(v?: string): string {
  if (v && DATE_RE.test(v)) return v;
  return 'all';
}

@Roles('管理者')
@Controller('audit')
@ApiTags('audit')
@ApiCookieAuth('mhi_token')
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
    assertYmd('from', from);
    assertYmd('to', to);

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
      const fname = `master-history_${sanitizeFilenamePart(from)}_${sanitizeFilenamePart(to)}.csv`;
      res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res!.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      return csv;
    }

    if (hasFilter || parsedPage) {
      return this.audit.findPage({
        ...query,
        page: parsedPage,
        pageSize: parsedPageSize,
      });
    }
    return this.audit.recent();
  }
}
