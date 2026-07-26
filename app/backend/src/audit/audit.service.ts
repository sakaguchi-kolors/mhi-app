// 操作監査ログ（設計仕様書1.3）。マスタ編集・取込・再計算・割当などを記録する。
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditRow {
  app_user: string | null;
  action: string | null;
  target: string | null;
  ref: string | null;
  at: string;
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
