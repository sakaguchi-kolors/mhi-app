// 操作監査ログ（設計仕様書1.3）。マスタ編集・取込・再計算・割当などを記録する。
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

const SKIP_KEYS = new Set(['created_at', 'created_by', 'updated_at', 'updated_by']);
const DEFAULT_PAGE_SIZE = 50;
export const CSV_MAX_ROWS = 10000;

const ACTION_LABEL: Record<string, string> = {
  'master.insert': '新規',
  'master.update': '更新',
  'master.delete': '削除',
  'master.import': '取込',
};

function jstDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

function jstDayEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+09:00`);
}

function formatVal(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'はい' : 'いいえ';
  return String(v);
}

function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((k) => !SKIP_KEYS.has(k) && formatVal(before?.[k]) !== formatVal(after?.[k]));
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function fmtAt(iso: string): string {
  return iso.replace('T', ' ').slice(0, 19);
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
    if (total > CSV_MAX_ROWS) {
      throw new BadRequestException(
        `該当件数が${total.toLocaleString('ja-JP')}件あります。CSV出力は最大${CSV_MAX_ROWS.toLocaleString('ja-JP')}件です。期間やマスタで絞り込んでください。`,
      );
    }
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: CSV_MAX_ROWS,
      select: { appUser: true, action: true, target: true, ref: true, at: true, before: true, after: true },
    });
    return rows.map(mapRow);
  }

  /** 変更履歴を CSV 文字列に展開（1変更項目=1行） */
  exportCsv(rows: AuditDetailRow[]): string {
    const header = ['日時', '操作者', '操作', '対象', 'キー', '項目', '変更前', '変更後'];
    const lines = [header.map(csvEscape).join(',')];

    for (const r of rows) {
      const action = ACTION_LABEL[r.action ?? ''] ?? (r.action ?? '');
      const fields = diffFields(r.before, r.after);
      if (fields.length === 0) {
        lines.push(
          [fmtAt(r.at), r.app_user ?? '', action, r.target ?? '', r.ref ?? '', '', '', '']
            .map((c) => csvEscape(c))
            .join(','),
        );
        continue;
      }
      for (const field of fields) {
        lines.push(
          [
            fmtAt(r.at),
            r.app_user ?? '',
            action,
            r.target ?? '',
            r.ref ?? '',
            field,
            formatVal(r.before?.[field]),
            formatVal(r.after?.[field]),
          ]
            .map((c) => csvEscape(c))
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
