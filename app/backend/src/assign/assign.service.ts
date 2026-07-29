// 担当者の自動割り当て。対象は未割当のみ。機種→担当ユーザー（m_user_kishu）へ均等配分。
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildKishuUsers, initAssignLoad, planAutoAssign } from './assign.util';

export interface AssignSummary {
  targeted: number;
  assigned: number;
  leftover: number;
  byOwner: { owner: string; count: number }[];
}

@Injectable()
export class AssignService {
  constructor(private readonly prisma: PrismaService) {}

  async autoAssign(): Promise<AssignSummary> {
    const [users, rels] = await Promise.all([
      this.prisma.user.findMany({ where: { active: true, role: '工程員' }, select: { userId: true, displayName: true } }),
      this.prisma.userKishu.findMany({ select: { userId: true, kishu: true } }),
    ]);
    const kishuUsers = buildKishuUsers(users, rels);

    const cnt = await this.prisma.assignment.groupBy({
      by: ['userId'],
      where: { userId: { not: null } },
      _count: { userId: true },
    });
    const load = initAssignLoad(
      cnt.map((r) => ({ userId: r.userId!, count: r._count.userId })),
      kishuUsers,
    );

    const [unassigned, statuses] = await Promise.all([
      this.prisma.assignment.findMany({ where: { userId: null }, select: { osId: true }, orderBy: { osId: 'asc' } }),
      this.prisma.partStatus.findMany({ select: { osId: true, kishu: true } }),
    ]);
    const kishuOf = new Map<string, string>(statuses.map((s) => [s.osId, s.kishu ?? '']));
    const targeted = unassigned.length;

    const { assignMap, leftover, byOwner } = planAutoAssign(
      unassigned.map((p) => p.osId),
      kishuOf,
      kishuUsers,
      load,
    );

    const byUserMap = new Map<number, string[]>();
    for (const [osId, u] of assignMap) {
      if (!byUserMap.has(u.userId)) byUserMap.set(u.userId, []);
      byUserMap.get(u.userId)!.push(osId);
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [userId, ids] of byUserMap) {
        for (let i = 0; i < ids.length; i += 1000) {
          const chunk = ids.slice(i, i + 1000);
          await tx.assignment.updateMany({
            where: { userId: null, osId: { in: chunk } },
            data: { userId, assignedAt: new Date() },
          });
        }
      }
    });

    return { targeted, assigned: assignMap.size, leftover, byOwner };
  }
}
