// 算出ロジック（設計仕様書 2章準拠）
// マスタ駆動：色境界・マイルストン定義・Shop別LT・稼働日カレンダーを外部から注入できる。
// 既定引数は現状（v0.1）の挙動を再現する。
import type { GaicStatus, Part, RoutingRow, TimelineCell } from '../common/types';
import { bufferColor } from '../shared/domain';
import type { MilestoneRule } from '../masters/masters.util';

export { bufferColor };

export interface CalcOptions {
  shopLtDays: number;
  milestoneLtDays: number;
  stagnantThreshold: number;
  bufGreen?: number; // 既定1
  bufYellow?: number; // 既定0
  milestoneRules?: MilestoneRule[]; // 無ければ組込みヒューリスティック
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

/** バッファ→色（2.3）。shared/domain.ts へ移動済み。後方互換のため re-export */

/** 検査（マイルストン）Shop判定（2.4）。rules未指定時は組込みヒューリスティック */
export function isMilestone(shop: string, name: string, rules?: MilestoneRule[]): boolean {
  if (rules) {
    for (const r of rules) {
      if (r.matchType === 'name_contains' && name.includes(r.pattern)) return true;
      if (r.matchType === 'shop' && shop === r.pattern) return true;
      if (r.matchType === 'shop_prefix' && shop.startsWith(r.pattern)) return true;
    }
    return false;
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

interface Cell {
  shop: string;
  job: string;
  planStart: Date | null;
  planEnd: Date | null;
  wip: boolean;
  gaic: boolean;
  materialStatus: string;
  hasIn: boolean;
  hasOut: boolean;
  hasEta: boolean;
  orderNo: string;
}

/** 連続する同一SHOPを1コマ(Shop)に圧縮 */
function compress(rows: RoutingRow[]): Cell[] {
  const cells: Cell[] = [];
  for (const r of rows) {
    const last = cells[cells.length - 1];
    if (last && last.shop === r.shop) {
      if (r.planStart && (!last.planStart || r.planStart < last.planStart)) last.planStart = r.planStart;
      if (r.planEnd && (!last.planEnd || r.planEnd > last.planEnd)) last.planEnd = r.planEnd;
      last.wip = last.wip || r.wip;
      if (r.outDate) {
        last.gaic = true;
        last.hasOut = true;
        last.materialStatus = r.materialStatus;
        last.hasIn = last.hasIn || !!r.inDate;
        last.hasEta = last.hasEta || !!r.etaDate;
        if (r.orderNo) last.orderNo = r.orderNo;
      }
      continue;
    }
    cells.push({
      shop: r.shop,
      job: r.job,
      planStart: r.planStart,
      planEnd: r.planEnd,
      wip: r.wip,
      gaic: !!r.outDate,
      materialStatus: r.materialStatus,
      hasIn: !!r.inDate,
      hasOut: !!r.outDate,
      hasEta: !!r.etaDate,
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

  const sorted = [...rows].sort((a, b) => a.seqMain - b.seqMain || a.seqSub - b.seqSub);
  const cells = compress(sorted);
  const total = cells.length;

  const currentIdx = cells.findIndex((c) => c.wip);
  const allDone = currentIdx < 0;
  const doneShops = allDone ? total : currentIdx;
  const remainShops = allDone ? 0 : total - currentIdx;

  const finalDue = meta.finalDue;
  // 仕様（要判断）: finalDue が null の部品は daysLeft=0 となり buffer も負になりやすく赤扱いになる。
  // 納期不明と納期超過は現状区別されない。
  const daysLeft = finalDue ? dayDiff(finalDue, asOf, o.holidays) : 0;
  // 残Shop所要 = 残コマのLT合計（Shop別LT上書き対応）
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
    if (isMilestone(c.shop, name, o.milestoneRules)) {
      cell.milestone = true;
      const passed = status === 'done';
      cell.mpassed = passed;
      if (!passed) {
        // 仕様（要判断）: マイルストン期日の逆算は暦日ベース（86400000ms/Shop）。
        // 残日数(daysLeft)は稼働日ベース(dayDiff)と非対称。
        const msDue = finalDue
          ? new Date(finalDue.getTime() - (total - 1 - i) * o.milestoneLtDays * 86400000)
          : null;
        cell.mdue = mmdd(msDue);
        // 現在コマ〜当該マイルストンまでの所要（LT合計）
        let needToMs = 0;
        if (currentIdx >= 0) for (let k = currentIdx; k <= i; k++) needToMs += ltOf(cells[k].shop);
        else needToMs = ltOf(c.shop);
        const daysLeftMs = msDue ? dayDiff(msDue, asOf, o.holidays) : 0;
        cell.mcolor = bufferColor(daysLeftMs - needToMs, green, yellow);
      }
    }
    if (c.gaic) {
      cell.gaic = true;
      cell.gorder = c.orderNo || undefined;
      cell.gstat = gaicStatus(c.hasIn, c.materialStatus, c.hasOut, c.hasEta);
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
    timeline,
    inst: meta.osId.replace(/\D/g, '').slice(-4),
  };
}
