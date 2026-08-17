// 部品詳細の調整支援：現行想定LTと HsベースLT を現在工程以降で比べる（純関数・DB非依存）。
import type { AdjustSupport, AdjustSupportRow } from '../shared/types';
import { mmdd } from '../shared/dates';

/** Hs 8時間 = 1日。表示は 0.5日単位 */
export const HS_HOURS_PER_DAY = 8;

export interface AdjustRoutingInput {
  shop: string;
  job: string;
  hs: number | null;
  wip: boolean;
}

export interface AdjustNameHint {
  shop: string;
  name: string;
}

export interface BuildAdjustSupportInput {
  rows: AdjustRoutingInput[];
  /** 基準日→依頼納期の残稼働日（算出済み） */
  daysLeft: number;
  finalDue: Date | null;
  shopLt: Map<string, number>;
  defaultLt: number;
  holidays?: Set<string>;
  /** タイムラインと同じ工程名。残工程の並びと対応させる */
  names?: AdjustNameHint[];
  hoursPerDay?: number;
}

interface CompressedCell {
  shop: string;
  job: string;
  hsSum: number;
  hsKnown: boolean;
  wip: boolean;
}

export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export function hsToLtDays(hsHours: number, hoursPerDay = HS_HOURS_PER_DAY): number {
  if (!Number.isFinite(hsHours) || hoursPerDay <= 0) return 0;
  return roundHalf(hsHours / hoursPerDay);
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 稼働日だけを進める（戻す）。小数日は四捨五入して日付にする */
export function addWorkdays(from: Date, days: number, holidays?: Set<string>): Date {
  const whole = Math.round(days);
  const cur = startOfDay(from);
  if (whole === 0) return cur;
  const step = whole > 0 ? 1 : -1;
  let left = Math.abs(whole);
  while (left > 0) {
    cur.setDate(cur.getDate() + step);
    if (!holidays?.has(isoDate(cur))) left--;
  }
  return cur;
}

/** 連続する同一 SHOP を1コマに圧縮し、Hs は合計する */
export function compressAdjustRows(rows: AdjustRoutingInput[]): CompressedCell[] {
  const cells: CompressedCell[] = [];
  for (const r of rows) {
    const shop = r.shop || '';
    const last = cells[cells.length - 1];
    if (last && last.shop === shop) {
      if (r.hs != null && Number.isFinite(r.hs)) {
        last.hsSum += r.hs;
        last.hsKnown = true;
      }
      last.wip = last.wip || r.wip;
      continue;
    }
    cells.push({
      shop,
      job: r.job,
      hsSum: r.hs != null && Number.isFinite(r.hs) ? r.hs : 0,
      hsKnown: r.hs != null && Number.isFinite(r.hs),
      wip: r.wip,
    });
  }
  return cells;
}

export function buildAdjustSupport(input: BuildAdjustSupportInput): AdjustSupport {
  const hoursPerDay = input.hoursPerDay ?? HS_HOURS_PER_DAY;
  const ltOf = (shop: string) => input.shopLt.get(shop) ?? input.defaultLt;
  const cells = compressAdjustRows(input.rows);
  const currentIdx = cells.findIndex((c) => c.wip);
  const remaining = currentIdx < 0 ? [] : cells.slice(currentIdx);

  const rows: AdjustSupportRow[] = remaining.map((c, i) => {
    const expectedLtDays = ltOf(c.shop);
    const hsHours = c.hsKnown ? Math.round(c.hsSum * 10) / 10 : null;
    const hsLtDays = c.hsKnown ? hsToLtDays(c.hsSum, hoursPerDay) : null;
    const diffDays = hsLtDays == null ? 0 : roundHalf(hsLtDays - expectedLtDays);
    const hint = input.names?.[i];
    const name = hint && (!hint.shop || hint.shop === c.shop) ? hint.name : `Shop ${c.shop}`;
    return {
      shop: c.shop,
      name,
      hsHours,
      hsLtDays,
      expectedLtDays,
      diffDays,
    };
  });

  const expectedNeed = rows.reduce((s, r) => s + r.expectedLtDays, 0);
  const delayDays = remaining.length === 0 ? 0 : roundHalf(expectedNeed - input.daysLeft);
  // 前倒し余地がある工程だけを足す（Hsのほうが長い工程はリカバリに入れない）
  const recoverableDays = roundHalf(
    rows.reduce((s, r) => {
      if (r.hsLtDays == null) return s;
      return s + Math.max(0, r.expectedLtDays - r.hsLtDays);
    }, 0),
  );
  const postRecoveryDelayDays = remaining.length === 0 ? 0 : roundHalf(delayDays - recoverableDays);
  const postRecoveryDate =
    input.finalDue && remaining.length > 0
      ? mmdd(addWorkdays(input.finalDue, postRecoveryDelayDays, input.holidays)) ?? null
      : input.finalDue
        ? mmdd(input.finalDue) ?? null
        : null;

  return {
    delayDays,
    recoverableDays,
    postRecoveryDelayDays,
    postRecoveryDate,
    finalDue: mmdd(input.finalDue) ?? null,
    hoursPerDay,
    rows,
  };
}
