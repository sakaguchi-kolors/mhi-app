// 担当者の自動割り当て。対象は未割当のみ。機種→担当ユーザー（m_user_kishu）へ均等配分。
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
    const userName = new Map<number, string>(users.map((u) => [u.userId, u.displayName]));
    const kishuUsers = new Map<string, { userId: number; name: string }[]>();
    for (const r of rels) {
      const name = userName.get(r.userId);
      if (!name) continue;
      const kishu = String(r.kishu);
      if (!kishuUsers.has(kishu)) kishuUsers.set(kishu, []);
      kishuUsers.get(kishu)!.push({ userId: r.userId, name });
    }

    const cnt = await this.prisma.assignment.groupBy({
      by: ['userId'],
      where: { userId: { not: null } },
      _count: { userId: true },
    });
    const load = new Map<number, number>(cnt.map((r) => [r.userId!, r._count.userId]));
    for (const list of kishuUsers.values()) for (const u of list) if (!load.has(u.userId)) load.set(u.userId, 0);

    const pickLeast = (cands: { userId: number; name: string }[]): { userId: number; name: string } | null => {
      if (!cands.length) return null;
      let best = cands[0];
      for (const c of cands) if ((load.get(c.userId) ?? 0) < (load.get(best.userId) ?? 0)) best = c;
      load.set(best.userId, (load.get(best.userId) ?? 0) + 1);
      return best;
    };

    const [unassigned, statuses] = await Promise.all([
      this.prisma.assignment.findMany({ where: { userId: null }, select: { osId: true }, orderBy: { osId: 'asc' } }),
      this.prisma.partStatus.findMany({ select: { osId: true, kishu: true } }),
    ]);
    const kishuOf = new Map<string, string>(statuses.map((s) => [s.osId, s.kishu ?? '']));
    const targeted = unassigned.length;

    const assignMap = new Map<string, { userId: number; name: string }>();
    let leftover = 0;
    for (const p of unassigned) {
      const picked = pickLeast(kishuUsers.get(kishuOf.get(p.osId) ?? '') ?? []);
      if (!picked) {
        leftover++;
        continue;
      }
      assignMap.set(p.osId, picked);
    }

    const byUserMap = new Map<number, { name: string; ids: string[] }>();
    for (const [osId, u] of assignMap) {
      if (!byUserMap.has(u.userId)) byUserMap.set(u.userId, { name: u.name, ids: [] });
      byUserMap.get(u.userId)!.ids.push(osId);
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [userId, { ids }] of byUserMap) {
        for (let i = 0; i < ids.length; i += 1000) {
          const chunk = ids.slice(i, i + 1000);
          await tx.assignment.updateMany({
            where: { userId: null, osId: { in: chunk } },
            data: { userId, assignedAt: new Date() },
          });
        }
      }
    });

    const byOwner = [...byUserMap.values()]
      .map(({ name, ids }) => ({ owner: name, count: ids.length }))
      .sort((a, b) => b.count - a.count);
    return { targeted, assigned: assignMap.size, leftover, byOwner };
  }
}
