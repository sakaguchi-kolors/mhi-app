// 操作監査ログ（設計仕様書1.3）。マスタ編集・取込・再計算・割当などを記録する。
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUDIT_CSV_MAX_ROWS,
  auditActionLabel,
  auditCompareVal,
  auditCsvEscape,
  auditCsvOverLimitMessage,
  auditDiffFields,
  auditFmtAt,
} from '../shared/audit';

export { AUDIT_CSV_MAX_ROWS as CSV_MAX_ROWS };

export interface AuditRow {
  app_user: string | null;
  action: string | null;
  target: string | null;
  ref: string | null;
  at: string;
}

export interface AuditDetailRow extends AuditRow {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface AuditQuery {
  target?: string;
  ref?: string;
  /** YYYY-MM-DD（JST の日付境界） */
  from?: string;
  /** YYYY-MM-DD（JST の日付境界） */
  to?: string;
  /** 操作種別の前方一致（例: master.） */
  actionPrefix?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditSearchResult {
  items: AuditDetailRow[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 50;

function jstDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

function jstDayEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+09:00`);
}

function mapRow(r: {
  appUser: string | null;
  action: string | null;
  target: string | null;
  ref: string | null;
  at: Date;
  before: unknown;
  after: unknown;
}): AuditDetailRow {
  return {
    app_user: r.appUser,
    action: r.action,
    target: r.target,
    ref: r.ref,
    at: r.at.toISOString(),
    before: (r.before as Record<string, unknown> | null) ?? null,
    after: (r.after as Record<string, unknown> | null) ?? null,
  };
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    user: string,
    action: string,
    target: string,
    ref: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        appUser: user,
        action,
        target,
        ref,
        before: before === undefined || before === null ? undefined : (before as object),
        after: after === undefined || after === null ? undefined : (after as object),
      },
    });
  }

  async recordMany(
    entries: Array<{
      user: string;
      action: string;
      target: string;
      ref: string;
      before: unknown;
      after: unknown;
    }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.prisma.auditLog.createMany({
      data: entries.map((e) => ({
        appUser: e.user,
        action: e.action,
        target: e.target,
        ref: e.ref,
        before: e.before === undefined || e.before === null ? undefined : (e.before as object),
        after: e.after === undefined || e.after === null ? undefined : (e.after as object),
      })),
    });
  }

  private where(opts: AuditQuery) {
    const atFilter: { gte?: Date; lte?: Date } = {};
    if (opts.from) atFilter.gte = jstDayStart(opts.from);
    if (opts.to) atFilter.lte = jstDayEnd(opts.to);
    return {
      ...(opts.target ? { target: opts.target } : {}),
      ...(opts.ref ? { ref: opts.ref } : {}),
      ...(opts.actionPrefix ? { action: { startsWith: opts.actionPrefix } } : {}),
      ...(Object.keys(atFilter).length ? { at: atFilter } : {}),
    };
  }

  /** 監査ログ検索（ページネーション・新しい順） */
  async findPage(opts: AuditQuery = {}): Promise<AuditSearchResult> {
    const pageSize = Math.min(Math.max(opts.pageSize ?? DEFAULT_PAGE_SIZE, 1), 200);
    const page = Math.max(opts.page ?? 1, 1);
    const where = this.where(opts);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { appUser: true, action: true, target: true, ref: true, at: true, before: true, after: true },
      }),
    ]);

    return {
      items: rows.map(mapRow),
      total,
      page,
      pageSize,
    };
  }

  /** CSV 出力用。件数が上限超過の場合は BadRequest */
  async findAllForExport(opts: AuditQuery = {}): Promise<AuditDetailRow[]> {
    const where = this.where(opts);
    const total = await this.prisma.auditLog.count({ where });
    if (total > AUDIT_CSV_MAX_ROWS) {
      throw new BadRequestException(auditCsvOverLimitMessage(total));
    }
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: AUDIT_CSV_MAX_ROWS,
      select: { appUser: true, action: true, target: true, ref: true, at: true, before: true, after: true },
    });
    return rows.map(mapRow);
  }

  /** 変更履歴を CSV 文字列に展開（1変更項目=1行） */
  exportCsv(rows: AuditDetailRow[]): string {
    const header = ['日時', '操作者', '操作', '対象', 'キー', '項目', '変更前', '変更後'];
    const lines = [header.map(auditCsvEscape).join(',')];

    for (const r of rows) {
      const action = auditActionLabel(r.action);
      const fields = auditDiffFields(r.before, r.after);
      if (fields.length === 0) {
        lines.push(
          [auditFmtAt(r.at), r.app_user ?? '', action, r.target ?? '', r.ref ?? '', '', '', '']
            .map((c) => auditCsvEscape(c))
            .join(','),
        );
        continue;
      }
      for (const field of fields) {
        lines.push(
          [
            auditFmtAt(r.at),
            r.app_user ?? '',
            action,
            r.target ?? '',
            r.ref ?? '',
            field,
            auditCompareVal(r.before?.[field]),
            auditCompareVal(r.after?.[field]),
          ]
            .map((c) => auditCsvEscape(c))
            .join(','),
        );
      }
    }

    return `\uFEFF${lines.join('\r\n')}`;
  }

  /** 直近の監査ログ（新しい順・最大100件） */
  async recent(): Promise<AuditRow[]> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { id: 'desc' },
      take: 100,
      select: { appUser: true, action: true, target: true, ref: true, at: true },
    });
    return rows.map((r) => ({
      app_user: r.appUser,
      action: r.action,
      target: r.target,
      ref: r.ref,
      at: r.at.toISOString(),
    }));
  }
}
