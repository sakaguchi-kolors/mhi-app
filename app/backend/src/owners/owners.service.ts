// 担当者×機種（ログインユーザー基準）。自動割り当てのキー m_user_kishu を編集する。
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface OwnerRow {
  user_id: number;
  email: string;
  displayName: string;
  role: string;
  active: boolean;
  kishus: string[];
}
export interface OwnersData {
  kishus: string[];
  owners: OwnerRow[];
}

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getOwners(): Promise<OwnersData> {
    const [kishuRows, userRows, relRows] = await Promise.all([
      this.prisma.kishu.findMany({ where: { active: true }, select: { kishu: true }, orderBy: { kishu: 'asc' } }),
      this.prisma.user.findMany({
        orderBy: { userId: 'asc' },
        select: { userId: true, email: true, displayName: true, role: true, active: true },
      }),
      this.prisma.userKishu.findMany({ select: { userId: true, kishu: true } }),
    ]);
    const byUser = new Map<number, string[]>();
    for (const r of relRows) {
      if (!byUser.has(r.userId)) byUser.set(r.userId, []);
      byUser.get(r.userId)!.push(String(r.kishu));
    }
    const owners: OwnerRow[] = userRows.map((u) => ({
      user_id: u.userId,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      active: u.active,
      kishus: byUser.get(u.userId) ?? [],
    }));
    return { kishus: kishuRows.map((r) => r.kishu), owners };
  }

  async toggleKishu(userId: number, kishu: string, on: boolean, user: string): Promise<void> {
    if (on) {
      await this.prisma.userKishu.upsert({
        where: { userId_kishu: { userId, kishu } },
        create: { userId, kishu },
        update: {},
      });
    } else {
      await this.prisma.userKishu.deleteMany({ where: { userId, kishu } });
    }
    await this.audit.record(
      user,
      on ? 'user.kishu.add' : 'user.kishu.remove',
      'm_user_kishu',
      `${userId}:${kishu}`,
      null,
      { userId, kishu, on },
    );
  }
}
