// 中間マイルストン: 工程 routing から利用中・最終利用日を集計（MSマスタ対象は SHOP_JOB のみ）
import type { PrismaClient } from '@prisma/client';
import { milestoneRowKey } from './milestone-mark.util';

/** 中間マイルストンマスタ（m_milestone）の対象は SHOP_JOB マスタ由来のみ。Flexi 補完 Shop は除外 */
export function isShopJobMasterSource(source: string | null | undefined): boolean {
  return (source ?? 'shop_job') === 'shop_job';
}

export interface MilestoneUsageStat {
  inUse: boolean;
  lastUsedAt: Date | null;
}

export interface RoutingUsageInput {
  shop: string | null | undefined;
  job: string | null | undefined;
  planEnd: Date | null | undefined;
  actualEnd: Date | null | undefined;
}

/** shop::job ごとに利用中フラグ・最終利用日を算出 */
export function computeMilestoneUsageStats(rows: RoutingUsageInput[]): Map<string, MilestoneUsageStat> {
  const acc = new Map<string, { hasActive: boolean; maxActual: Date | null }>();

  for (const r of rows) {
    const shop = String(r.shop ?? '').trim();
    const job = String(r.job ?? '').trim();
    if (!shop) continue;
    const key = milestoneRowKey(shop, job);
    let stat = acc.get(key);
    if (!stat) {
      stat = { hasActive: false, maxActual: null };
      acc.set(key, stat);
    }
    if (!r.actualEnd && r.planEnd) stat.hasActive = true;
    if (r.actualEnd && (!stat.maxActual || r.actualEnd > stat.maxActual)) {
      stat.maxActual = r.actualEnd;
    }
  }

  const out = new Map<string, MilestoneUsageStat>();
  for (const [key, stat] of acc) {
    out.set(key, {
      inUse: stat.hasActive,
      lastUsedAt: stat.hasActive ? null : stat.maxActual,
    });
  }
  return out;
}

type PrismaLike = Pick<PrismaClient, 'routing' | 'shopMaster' | 'milestone'>;

/** 取込後: 利用中でない行を過去マスタへ自動退避（手動変更済みは維持） */
export async function syncMilestoneArchive(prisma: PrismaLike, user: string): Promise<{ archived: number; restored: number }> {
  const [routes, shops, existing] = await Promise.all([
    prisma.routing.findMany({ select: { shop: true, job: true, planEnd: true, actualEnd: true } }),
    prisma.shopMaster.findMany({ select: { shop: true, job: true, source: true } }),
    prisma.milestone.findMany(),
  ]);
  const stats = computeMilestoneUsageStats(routes);
  const existingMap = new Map(existing.map((m) => [milestoneRowKey(m.shop, m.job), m]));
  const now = new Date();
  let archived = 0;
  let restored = 0;

  for (const sm of shops) {
    if (!isShopJobMasterSource(sm.source)) continue;
    const key = milestoneRowKey(sm.shop, sm.job);
    const stat = stats.get(key) ?? { inUse: false, lastUsedAt: null };
    const ex = existingMap.get(key);
    if (ex?.archivedManual) continue;

    const shouldArchive = !stat.inUse;
    if (ex) {
      if (ex.archived === shouldArchive) continue;
      await prisma.milestone.update({
        where: { shop_job: { shop: sm.shop, job: sm.job } },
        data: { archived: shouldArchive, updatedAt: now, updatedBy: user },
      });
      if (shouldArchive) archived++;
      else restored++;
    } else if (shouldArchive) {
      await prisma.milestone.create({
        data: {
          shop: sm.shop,
          job: sm.job,
          isMilestone: false,
          gaic: false,
          archived: true,
          archivedManual: false,
          createdAt: now,
          createdBy: user,
          updatedAt: now,
          updatedBy: user,
        },
      });
      archived++;
    }
  }

  return { archived, restored };
}

export async function loadMilestoneUsageStats(prisma: PrismaLike): Promise<Map<string, MilestoneUsageStat>> {
  const routes = await prisma.routing.findMany({
    select: { shop: true, job: true, planEnd: true, actualEnd: true },
  });
  return computeMilestoneUsageStats(routes);
}
