// 算出用に読み込むマスタコンテキスト（プロトタイプ masters.ts の loadMasters 相当）。
import type { PrismaService } from '../prisma/prisma.service';
import { milestoneRowKey } from './milestone-mark.util';
import { isShopJobMasterSource } from './milestone-usage.util';
import type { DueSourceKind } from '../etl/etl-compute.util';
import { DUE_SOURCE_KINDS, parseDefaultKishuDuePriority } from '../etl/etl-compute.util';

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
  };
  /** shop::job の Set。工程マイルストン(◎)対象 */
  milestoneMarks: Set<string>;
  /** shop::job の Set。外注(外)対象（OCTPuS実績と OR） */
  gaicMarks: Set<string>;
  shopLt: Map<string, number>;
  categoryRules: CategoryRule[]; // priority昇順
  holidays: Set<string>; // 'YYYY-MM-DD'（休日）
  vendors: { prefix: string; name: string }[]; // 長いprefix優先で探索
  /** 機種別・個別設定の優先順位（3段）。未登録＝標準を参照 */
  kishuDuePriority: Map<string, DueSourceKind[]>;
  /** 標準の納期優先順位（m_param） */
  defaultKishuDuePriority: DueSourceKind[];
}

export async function loadMasters(prisma: PrismaService): Promise<MasterContext> {
  const [param, ms, shopMaster, lt, cal, ven, cat, kishuDue] = await Promise.all([
    prisma.param.findMany({ select: { key: true, value: true } }),
    prisma.milestone.findMany({
      select: { shop: true, job: true, isMilestone: true, gaic: true },
    }),
    prisma.shopMaster.findMany({ select: { shop: true, job: true, source: true } }),
    prisma.shopLt.findMany({ where: { active: true }, select: { shop: true, ltDays: true } }),
    prisma.calendar.findMany({ select: { calDate: true, isWorkday: true } }),
    prisma.vendor.findMany({ where: { active: true }, select: { orderPrefix: true, vendorName: true } }),
    prisma.category.findMany({
      where: { active: true },
      select: { pattern: true, category: true },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    }),
    prisma.kishuDuePriority.findMany({
      select: { kishu: true, priority1: true, priority2: true, priority3: true },
    }),
  ]);

  const pmap = new Map<string, string>(param.map((r) => [r.key, r.value]));
  const numP = (k: string, d: number) => (pmap.has(k) ? Number(pmap.get(k)) : d);
  const defaultKishuDuePriority = parseDefaultKishuDuePriority(pmap);
  const params: MasterContext['params'] = {
    shopLtDays: numP('SHOP_LT_DAYS', 4),
    milestoneLtDays: numP('MILESTONE_LT_DAYS', 5),
    stagnantThreshold: numP('STAGNANT_THRESHOLD', 10),
    bufGreen: numP('BUFFER_GREEN', 1),
    bufYellow: numP('BUFFER_YELLOW', 0),
  };
  const shopJobKeys = new Set(
    shopMaster.filter((s) => isShopJobMasterSource(s.source)).map((s) => milestoneRowKey(String(s.shop), String(s.job))),
  );
  const milestoneMarks = new Set<string>();
  const gaicMarks = new Set<string>();
  for (const r of ms) {
    const key = milestoneRowKey(String(r.shop), String(r.job));
    if (!shopJobKeys.has(key)) continue;
    if (r.isMilestone) milestoneMarks.add(key);
    if (r.gaic) gaicMarks.add(key);
  }
  const shopLt = new Map<string, number>(lt.map((r) => [String(r.shop), Number(r.ltDays)]));
  const categoryRules: CategoryRule[] = cat.map((r) => ({ re: safeRe(r.pattern), category: r.category }));
  const holidays = new Set<string>(cal.filter((r) => r.isWorkday === false).map((r) => isoDate(r.calDate)));
  const vendors = ven
    .map((r) => ({ prefix: String(r.orderPrefix), name: String(r.vendorName) }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  const kishuDuePriority = new Map<string, DueSourceKind[]>();
  for (const r of kishuDue) {
    const p: DueSourceKind[] = [r.priority1, r.priority2, r.priority3] as DueSourceKind[];
    if (p.every((x) => DUE_SOURCE_KINDS.includes(x)) && new Set(p).size === 3) {
      kishuDuePriority.set(String(r.kishu), p);
    }
  }

  return {
    params,
    milestoneMarks,
    gaicMarks,
    shopLt,
    categoryRules,
    holidays,
    vendors,
    kishuDuePriority,
    defaultKishuDuePriority,
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
