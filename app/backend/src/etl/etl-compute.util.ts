// ETL / recompute で共有する算出オプション・行生成ロジック
import type { CalcOptions } from '../calc/calc';
import type { PartMeta } from '../calc/calc';
import type { Part } from '../common/types';
import type { MasterContext } from '../masters/masters.util';
import { mmddToDate } from './etl-dates';

export function buildCalcOpts(M: MasterContext): CalcOptions {
  return {
    shopLtDays: M.params.shopLtDays,
    milestoneLtDays: M.params.milestoneLtDays,
    stagnantThreshold: M.params.stagnantThreshold,
    bufGreen: M.params.bufGreen,
    bufYellow: M.params.bufYellow,
    milestoneRules: M.milestoneRules,
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

export function resolveFinalDue(
  dueSource: 'flexsche' | 'pbs',
  flexMax: Date | null,
  pbsDue: Date | null,
): Date | null {
  return dueSource === 'pbs' ? (pbsDue ?? flexMax) : (flexMax ?? pbsDue);
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
        t.gorder ?? null,
      ]);
    }
  }

  return { statusRows, timelineRows };
}
