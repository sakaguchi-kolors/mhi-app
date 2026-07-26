// 算出用に読み込むマスタコンテキスト（プロトタイプ masters.ts の loadMasters 相当）。
// pg 直叩き → Prisma の型付きモデルアクセスへ置き換え。挙動は同一。
import type { PrismaService } from '../prisma/prisma.service';

export interface MilestoneRule {
  matchType: string;
  pattern: string;
}
export interface CategoryRule {
  re: RegExp;
  category: string;
}
export interface MasterContext {
  params: {
    shopLtDays: number;
    milestoneLtDays: number;
    stagnantThreshold: number;
    bufGreen: number;
    bufYellow: number;
    dueSource: 'flexsche' | 'pbs';
  };
  milestoneRules: MilestoneRule[];
  shopLt: Map<string, number>;
  categoryRules: CategoryRule[]; // priority昇順
  holidays: Set<string>; // 'YYYY-MM-DD'（休日）
  vendors: { prefix: string; name: string }[]; // 長いprefix優先で探索
}

export async function loadMasters(prisma: PrismaService): Promise<MasterContext> {
  const [param, ms, lt, cal, ven, cat] = await Promise.all([
    prisma.param.findMany({ select: { key: true, value: true } }),
    prisma.milestone.findMany({
      where: { active: true },
      select: { matchType: true, pattern: true },
      orderBy: { id: 'asc' },
    }),
    prisma.shopLt.findMany({ where: { active: true }, select: { shop: true, ltDays: true } }),
    prisma.calendar.findMany({ select: { calDate: true, isWorkday: true } }),
    prisma.vendor.findMany({ where: { active: true }, select: { orderPrefix: true, vendorName: true } }),
    prisma.category.findMany({
      where: { active: true },
      select: { pattern: true, category: true },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const pmap = new Map<string, string>(param.map((r) => [r.key, r.value]));
  const numP = (k: string, d: number) => (pmap.has(k) ? Number(pmap.get(k)) : d);
  const params: MasterContext['params'] = {
    shopLtDays: numP('SHOP_LT_DAYS', 4),
    milestoneLtDays: numP('MILESTONE_LT_DAYS', 5),
    stagnantThreshold: numP('STAGNANT_THRESHOLD', 10),
    bufGreen: numP('BUFFER_GREEN', 1),
    bufYellow: numP('BUFFER_YELLOW', 0),
    dueSource: pmap.get('DUE_SOURCE') === 'pbs' ? 'pbs' : 'flexsche',
  };
  const shopLt = new Map<string, number>(lt.map((r) => [String(r.shop), Number(r.ltDays)]));
  const categoryRules: CategoryRule[] = cat.map((r) => ({ re: safeRe(r.pattern), category: r.category }));
  const holidays = new Set<string>(cal.filter((r) => r.isWorkday === false).map((r) => isoDate(r.calDate)));
  const vendors = ven
    .map((r) => ({ prefix: String(r.orderPrefix), name: String(r.vendorName) }))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  return {
    params,
    milestoneRules: ms.map((r) => ({ matchType: r.matchType, pattern: r.pattern })),
    shopLt,
    categoryRules,
    holidays,
    vendors,
  };
}

function safeRe(p: string): RegExp {
  try {
    return new RegExp(p);
  } catch {
    return /$^/;
  }
}
function isoDate(d: unknown): string {
  if (d instanceof Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return String(d).slice(0, 10);
}
