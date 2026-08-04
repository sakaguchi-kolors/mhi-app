// ETL / recompute で共有する算出オプション・行生成ロジック
import type { CalcOptions } from '../calc/calc';
import type { PartMeta } from '../calc/calc';
import type { Part } from '../common/types';
import type { MasterContext } from '../masters/masters.util';
import type { ColorCounts } from './etl-types';
import { mmddToDate } from './etl-dates';

export function aggregateColorCounts(colors: (string | null | undefined)[]): ColorCounts {
  let green = 0;
  let yellow = 0;
  let red = 0;
  for (const c of colors) {
    if (c === 'red') red++;
    else if (c === 'yellow') yellow++;
    else green++;
  }
  return { green, yellow, red };
}

export type DueSourceKind = 'flexsche' | 'octopus' | 'pbs';

export const DUE_SOURCE_KINDS: DueSourceKind[] = ['flexsche', 'octopus', 'pbs'];

/** 機種別納期優先順位の標準（PBS → 小日程 → OCTPuS）。m_param 未設定時のフォールバック */
export const DEFAULT_KISHU_DUE_PRIORITY: DueSourceKind[] = ['pbs', 'flexsche', 'octopus'];

export const KISHU_DUE_PRIORITY_PARAM_KEYS = [
  'KISHU_DUE_PRIORITY_1',
  'KISHU_DUE_PRIORITY_2',
  'KISHU_DUE_PRIORITY_3',
] as const;

export function parseDefaultKishuDuePriority(pmap: Map<string, string>): DueSourceKind[] {
  const p = KISHU_DUE_PRIORITY_PARAM_KEYS.map((k, i) => {
    const v = pmap.get(k);
    return v && DUE_SOURCE_KINDS.includes(v as DueSourceKind) ? (v as DueSourceKind) : DEFAULT_KISHU_DUE_PRIORITY[i];
  });
  return new Set(p).size === 3 ? p : DEFAULT_KISHU_DUE_PRIORITY;
}

export function isDefaultKishuDuePriority(
  priority: DueSourceKind[],
  defaultPriority: DueSourceKind[] = DEFAULT_KISHU_DUE_PRIORITY,
): boolean {
  return (
    priority.length === 3 &&
    priority[0] === defaultPriority[0] &&
    priority[1] === defaultPriority[1] &&
    priority[2] === defaultPriority[2]
  );
}

export interface DueCandidates {
  flexsche: Date | null;
  octopus: Date | null;
  pbs: Date | null;
}

export function buildCalcOpts(M: MasterContext): CalcOptions {
  return {
    shopLtDays: M.params.shopLtDays,
    milestoneLtDays: M.params.milestoneLtDays,
    stagnantThreshold: M.params.stagnantThreshold,
    bufGreen: M.params.bufGreen,
    bufYellow: M.params.bufYellow,
    milestoneMarks: M.milestoneMarks,
    gaicMarks: M.gaicMarks,
    shopLt: M.shopLt,
    holidays: M.holidays,
  };
}

export function flexMaxFromRows(rows: { planEnd: Date | null }[]): Date | null {
  let d: Date | null = null;
  for (const rr of rows) {
    if (rr.planEnd && (!d || rr.planEnd > d)) d = rr.planEnd;
  }
  return d;
}

export function resolveFinalDueFromPriority(
  priority: DueSourceKind[],
  candidates: DueCandidates,
): Date | null {
  for (const src of priority) {
    const d = candidates[src];
    if (d) return d;
  }
  return null;
}

export function resolveFinalDueForPart(
  kishu: string,
  candidates: DueCandidates,
  kishuDuePriority: MasterContext['kishuDuePriority'],
  defaultPriority: DueSourceKind[],
): Date | null {
  const priority = kishuDuePriority.get(kishu) ?? defaultPriority;
  return resolveFinalDueFromPriority(priority, candidates);
}

export interface ComputedItem {
  osId: string;
  meta: PartMeta;
  part: Part;
}

export interface StatusTimelineRows {
  statusRows: unknown[][];
  timelineRows: unknown[][];
}

/** t_part_status / t_timeline への INSERT 行を生成 */
export function buildStatusTimelineRows(
  items: ComputedItem[],
  asOf: Date,
  computedAt: Date,
): StatusTimelineRows {
  const statusRows: unknown[][] = [];
  const timelineRows: unknown[][] = [];

  for (const { osId, meta, part } of items) {
    statusRows.push([
      osId,
      part.partNo,
      part.name,
      part.category,
      part.kishu,
      meta.finalDue,
      part.totalShops,
      part.doneShops,
      part.remainShops,
      part.currentShop,
      part.daysLeft,
      part.buffer,
      part.color,
      part.stagnant,
      part.urgent,
      part.shortage,
      computedAt,
    ]);
    let tseq = 0;
    for (const t of part.timeline) {
      tseq++;
      timelineRows.push([
        osId,
        tseq,
        t.shop,
        t.name,
        t.status,
        mmddToDate(t.plan, asOf),
        !!t.milestone,
        t.mpassed ?? null,
        t.mcolor ?? null,
        mmddToDate(t.mdue, asOf),
        !!t.gaic,
        t.gstat ?? null,
        t.gphase ?? null,
        t.gorder ?? null,
        mmddToDate(t.gout, asOf),
        mmddToDate(t.gin, asOf),
        mmddToDate(t.geta, asOf),
        mmddToDate(t.greq, asOf),
      ]);
    }
  }

  return { statusRows, timelineRows };
}
