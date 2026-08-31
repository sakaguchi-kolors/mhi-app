// 算出ロジック（設計仕様書 2章準拠）
// マスタ駆動：色境界・マイルストン定義・Shop別LT・稼働日カレンダーを外部から注入できる。
import type { GaicPhase, GaicStatus, Part, RoutingRow, TimelineCell } from '../common/types';
import { bufferColor } from '../shared/domain';
import { milestoneRowKey } from '../masters/milestone-mark.util';

export { bufferColor };

export interface CalcOptions {
  shopLtDays: number;
  milestoneLtDays: number;
  stagnantThreshold: number;
  bufGreen?: number; // 既定1
  bufYellow?: number; // 既定0
  /** shop::job。指定時はこちらを優先（空 Set も有効） */
  milestoneMarks?: Set<string>;
  /** shop::job。OCTPuS実績(outDate)と OR */
  gaicMarks?: Set<string>;
  shopLt?: Map<string, number>; // Shop別LT上書き
  holidays?: Set<string>; // 'YYYY-MM-DD' 休日（稼働日計算）
}

/** 日付だけを取り出した経過日数 a - b（暦日） */
export function diffDays(a: Date, b: Date): number {
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da - db) / 86400000);
}

/** 稼働日ベースの経過日数 a - b。holidays が空なら暦日と同じ。 */
export function dayDiff(a: Date, b: Date, holidays?: Set<string>): number {
  const base = diffDays(a, b);
  if (!holidays || holidays.size === 0 || base === 0) return base;
  const lo = base > 0 ? b : a;
  const hi = base > 0 ? a : b;
  let h = 0;
  const cur = new Date(lo);
  cur.setDate(cur.getDate() + 1);
  while (cur <= hi) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    if (holidays.has(iso)) h++;
    cur.setDate(cur.getDate() + 1);
  }
  return base > 0 ? base - h : base + h;
}

export function mmdd(d: Date | null): string | undefined {
  if (!d) return undefined;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
export function ymd(d: Date | null): string {
  if (!d) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/** 検査（マイルストン）判定。marks 指定時は shop::job のみ。未指定時は組込みヒューリスティック */
export function isMilestone(shop: string, name: string, marks?: Set<string>, job?: string): boolean {
  if (marks !== undefined && job !== undefined) {
    return marks.has(milestoneRowKey(shop, job));
  }
  return /検査|試験|バランステスト/.test(name) || /^7P3/.test(shop) || shop === '7P42';
}

/** 外注ステータス（2.6）：上から順に評価 */
export function gaicStatus(hasIn: boolean, materialStatus: string, hasOut: boolean, hasEta: boolean): GaicStatus {
  if (hasIn) return 'blue';
  if (materialStatus !== '4_材料払出済') return 'red';
  if (!hasOut || !hasEta) return 'yellow';
  return 'blue';
}

/** 外注工程進捗フェーズ：持出待 → 持出済 → 納入待 → 持込済 */
export function gaicPhase(hasIn: boolean, materialStatus: string, hasOut: boolean, hasEta: boolean): GaicPhase {
  if (hasIn) return 'in_done';
  if (!hasOut || materialStatus !== '4_材料払出済') return 'wait_out';
  if (!hasEta) return 'out_done';
  return 'wait_in';
}

function pickLater(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

interface Cell {
  shop: string;
  job: string;
  planStart: Date | null;
  planEnd: Date | null;
  wip: boolean;
  milestone: boolean;
  gaic: boolean;
  materialStatus: string;
  hasIn: boolean;
  hasOut: boolean;
  hasEta: boolean;
  hasReq: boolean;
  outDate: Date | null;
  inDate: Date | null;
  etaDate: Date | null;
  reqDueDate: Date | null;
  orderNo: string;
}

function rowGaic(r: RoutingRow, gaicMarks?: Set<string>): boolean {
  return !!r.outDate || (gaicMarks?.has(milestoneRowKey(r.shop, r.job)) ?? false);
}

/** 連続する同一SHOPを1コマ(Shop)に圧縮 */
function compress(rows: RoutingRow[], opts?: { milestoneMarks?: Set<string>; gaicMarks?: Set<string> }): Cell[] {
  const milestoneMarks = opts?.milestoneMarks;
  const gaicMarks = opts?.gaicMarks;
  const cells: Cell[] = [];
  for (const r of rows) {
    const key = milestoneRowKey(r.shop, r.job);
    const last = cells[cells.length - 1];
    if (last && last.shop === r.shop) {
      if (r.planStart && (!last.planStart || r.planStart < last.planStart)) last.planStart = r.planStart;
      if (r.planEnd && (!last.planEnd || r.planEnd > last.planEnd)) last.planEnd = r.planEnd;
      last.wip = last.wip || r.wip;
      if (milestoneMarks?.has(key)) last.milestone = true;
      if (rowGaic(r, gaicMarks)) {
        last.gaic = true;
        if (r.outDate) {
          last.hasOut = true;
          last.outDate = pickLater(last.outDate, r.outDate);
          last.materialStatus = r.materialStatus;
          last.hasIn = last.hasIn || !!r.inDate;
          last.inDate = pickLater(last.inDate, r.inDate);
          last.hasEta = last.hasEta || !!r.etaDate;
          last.etaDate = pickLater(last.etaDate, r.etaDate);
          last.hasReq = last.hasReq || !!r.reqDueDate;
          last.reqDueDate = pickLater(last.reqDueDate, r.reqDueDate);
          if (r.orderNo) last.orderNo = r.orderNo;
        } else if (r.inDate || r.etaDate || r.reqDueDate) {
          last.hasIn = last.hasIn || !!r.inDate;
          last.inDate = pickLater(last.inDate, r.inDate);
          last.hasEta = last.hasEta || !!r.etaDate;
          last.etaDate = pickLater(last.etaDate, r.etaDate);
          last.hasReq = last.hasReq || !!r.reqDueDate;
          last.reqDueDate = pickLater(last.reqDueDate, r.reqDueDate);
          if (r.materialStatus) last.materialStatus = r.materialStatus;
        }
      }
      continue;
    }
    const gaic = rowGaic(r, gaicMarks);
    cells.push({
      shop: r.shop,
      job: r.job,
      planStart: r.planStart,
      planEnd: r.planEnd,
      wip: r.wip,
      milestone: milestoneMarks?.has(key) ?? false,
      gaic,
      materialStatus: r.materialStatus,
      hasIn: !!r.inDate,
      hasOut: !!r.outDate,
      hasEta: !!r.etaDate,
      hasReq: !!r.reqDueDate,
      outDate: r.outDate,
      inDate: r.inDate,
      etaDate: r.etaDate,
      reqDueDate: r.reqDueDate,
      orderNo: r.orderNo,
    });
  }
  return cells;
}

export interface PartMeta {
  osId: string;
  partNo: string;
  name: string;
  category: string;
  kishu: string;
  finalDue: Date | null;
  urgent: boolean;
  shortage: boolean;
}

export function computePart(
  meta: PartMeta,
  rows: RoutingRow[],
  resolveName: (shop: string, job: string) => string,
  asOf: Date,
  o: CalcOptions,
): Part {
  const green = o.bufGreen ?? 1;
  const yellow = o.bufYellow ?? 0;
  const ltOf = (shop: string) => o.shopLt?.get(shop) ?? o.shopLtDays;
  const useMarks = o.milestoneMarks !== undefined;

  const sorted = [...rows].sort((a, b) => a.seqMain - b.seqMain || a.seqSub - b.seqSub);
  const cells = compress(sorted, { milestoneMarks: o.milestoneMarks, gaicMarks: o.gaicMarks });
  const total = cells.length;

  const currentIdx = cells.findIndex((c) => c.wip);
  const allDone = currentIdx < 0;
  const doneShops = allDone ? total : currentIdx;
  const remainShops = allDone ? 0 : total - currentIdx;

  const finalDue = meta.finalDue;
  const daysLeft = finalDue ? dayDiff(finalDue, asOf, o.holidays) : 0;
  let need = 0;
  if (!allDone) for (let i = currentIdx; i < total; i++) need += ltOf(cells[i].shop);
  const buffer = daysLeft - need;
  const color = bufferColor(buffer, green, yellow);

  const currentCell = currentIdx >= 0 ? cells[currentIdx] : null;
  const stagnant =
    currentCell && currentCell.planStart ? Math.max(0, dayDiff(asOf, currentCell.planStart, o.holidays)) : 0;
  const currentShop = currentCell ? resolveName(currentCell.shop, currentCell.job) : '（完了）';

  const timeline: TimelineCell[] = cells.map((c, i) => {
    const status = allDone || i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'wait';
    const name = resolveName(c.shop, c.job);
    const cell: TimelineCell = { shop: c.shop, name, status, plan: mmdd(c.planEnd) };
    const ms =
      useMarks ? c.milestone : isMilestone(c.shop, name, undefined, c.job);
    if (ms) {
      cell.milestone = true;
      const passed = status === 'done';
      cell.mpassed = passed;
      if (!passed) {
        const msDue = finalDue
          ? new Date(finalDue.getTime() - (total - 1 - i) * o.milestoneLtDays * 86400000)
          : null;
        cell.mdue = mmdd(msDue);
        let needToMs = 0;
        if (currentIdx >= 0) for (let k = currentIdx; k <= i; k++) needToMs += ltOf(cells[k].shop);
        else needToMs = ltOf(c.shop);
        const daysLeftMs = msDue ? dayDiff(msDue, asOf, o.holidays) : 0;
        const behind = daysLeftMs - needToMs;
        cell.mcolor = bufferColor(behind, green, yellow);
        cell.msBehind = behind;
      }
    }
    if (c.gaic) {
      cell.gaic = true;
      cell.gorder = c.orderNo || undefined;
      cell.gstat = gaicStatus(c.hasIn, c.materialStatus, c.hasOut, c.hasEta);
      cell.gphase = gaicPhase(c.hasIn, c.materialStatus, c.hasOut, c.hasEta);
      cell.gout = mmdd(c.outDate);
      cell.gin = mmdd(c.inDate);
      cell.geta = mmdd(c.etaDate);
      cell.greq = mmdd(c.reqDueDate);
    }
    return cell;
  });

  return {
    id: meta.osId,
    partNo: meta.partNo,
    name: meta.name,
    category: meta.category,
    kishu: meta.kishu,
    finalDue: ymd(finalDue),
    daysLeft,
    totalShops: total,
    doneShops,
    remainShops,
    buffer,
    color,
    stagnant,
    urgent: meta.urgent,
    shortage: meta.shortage,
    currentShop,
    currentShopCode: currentCell?.shop ?? '',
    timeline,
    inst: meta.osId.replace(/\D/g, '').slice(-4),
  };
}
