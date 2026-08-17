// 実績リードタイム集計の純ロジック。
//
// 「1 SHOP あたり何日かかっているか」を JND(実績) から求める。
// 作業実施日（着手→完了）ではなく **前 SHOP 完了 → 当 SHOP 完了のインターバル** を採る。
// 前者は同日完了が大半で、待ち時間を含まないためリードタイムにならない。
//
// バッファ計算は連続する同一 SHOP を1コマに圧縮した単位で LT を積むため（calc.ts の compress）、
// ここでも同じ圧縮をしてから差分を取る。揃えないと採用値がそのままズレる。
// 日数も同じ理由で稼働日ベース（残日数が稼働日で出ているため）。
import { dayDiff } from '../calc/calc';

/** 集計入力。t_routing の必要列だけ */
export interface LtRoutingRow {
  osId: string;
  seq: number;
  shop: string;
  actualEnd: Date | null;
  hs: number | null;
}

export interface LtSample {
  shop: string;
  days: number;
}

export interface ShopLtStatRow {
  shop: string;
  n: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
  hsMedian: number | null;
}

export type LtPercentileKey = 'p50' | 'p75' | 'p90';
export const LT_PERCENTILE_KEYS: LtPercentileKey[] = ['p50', 'p75', 'p90'];

export interface LtAggregateOptions {
  /** これを超えるインターバルは異常値として除外（長期停止・データ不整合） */
  maxDays: number;
  /** 'YYYY-MM-DD' の休日。未指定なら暦日で数える */
  holidays?: Set<string>;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 昇順ソート済み配列の分位点（線形補間）。空配列は 0 */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

/** 中央値。空配列は null */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return percentile([...values].sort((a, b) => a - b), 0.5);
}

/**
 * 1部品分の工程行から SHOP 別インターバルを取り出す。
 * rows は同一 osId のもの。seq 昇順でなくてもよい（内部でソートする）。
 * 先頭コマは前工程が無いのでサンプルにならない。
 */
export function collectLtSamples(rows: LtRoutingRow[], opts: LtAggregateOptions): LtSample[] {
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);

  // 連続する同一 SHOP を1コマに圧縮し、コマの完了日＝コマ内 actualEnd の最大値とする。
  // 1行でも実績が欠けているコマは「まだ完了していない」とみなし、完了日を持たせない。
  const cells: { shop: string; end: Date | null }[] = [];
  for (const r of sorted) {
    if (!r.shop) continue;
    const last = cells[cells.length - 1];
    if (last && last.shop === r.shop) {
      if (!r.actualEnd) last.end = null;
      else if (last.end && r.actualEnd > last.end) last.end = r.actualEnd;
      continue;
    }
    cells.push({ shop: r.shop, end: r.actualEnd });
  }

  const out: LtSample[] = [];
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1];
    const cur = cells[i];
    if (!prev.end || !cur.end) continue;
    const days = dayDiff(cur.end, prev.end, opts.holidays);
    if (days < 0 || days > opts.maxDays) continue;
    out.push({ shop: cur.shop, days });
  }
  return out;
}

/** SHOP 別に分位点を出す。hsByShop は参考表示用の Hs（時間）一覧 */
export function aggregateShopLt(
  samples: LtSample[],
  hsByShop: Map<string, number[]> = new Map(),
): ShopLtStatRow[] {
  const byShop = new Map<string, number[]>();
  for (const s of samples) {
    let arr = byShop.get(s.shop);
    if (!arr) {
      arr = [];
      byShop.set(s.shop, arr);
    }
    arr.push(s.days);
  }

  const rows: ShopLtStatRow[] = [];
  for (const [shop, days] of byShop) {
    days.sort((a, b) => a - b);
    const hsMed = medianOf(hsByShop.get(shop) ?? []);
    rows.push({
      shop,
      n: days.length,
      p50: round1(percentile(days, 0.5)),
      p75: round1(percentile(days, 0.75)),
      p90: round1(percentile(days, 0.9)),
      mean: round1(days.reduce((s, d) => s + d, 0) / days.length),
      hsMedian: hsMed == null ? null : round1(hsMed),
    });
  }
  rows.sort((a, b) => b.n - a.n || a.shop.localeCompare(b.shop));
  return rows;
}

/**
 * 実績から推奨する LT（日）。サンプルが少ない SHOP は推奨しない（null）。
 * 0日運用は現実的でないため下限1日に丸める。
 */
export function recommendLtDays(
  stat: ShopLtStatRow,
  key: LtPercentileKey,
  minSamples: number,
): number | null {
  if (stat.n < minSamples) return null;
  return Math.max(1, Math.round(stat[key]));
}

/**
 * バッファ計算に渡す SHOP 別 LT マップを組み立てる。
 *   fixed  … m_shop_lt（手入力）のみ。現行動作
 *   actual … 実績の分位点を優先し、無い SHOP は m_shop_lt → 既定LT にフォールバック
 * m_shop_lt に手入力がある SHOP は actual でも手入力を優先する。
 * 現場が意図して入れた値を集計値で黙って上書きしないため。
 */
export function buildShopLtMap(
  mode: 'fixed' | 'actual',
  manual: Map<string, number>,
  stats: ShopLtStatRow[],
  key: LtPercentileKey,
  minSamples: number,
): Map<string, number> {
  if (mode === 'fixed') return new Map(manual);
  const out = new Map<string, number>();
  for (const s of stats) {
    const rec = recommendLtDays(s, key, minSamples);
    if (rec != null) out.set(s.shop, rec);
  }
  for (const [shop, v] of manual) out.set(shop, v);
  return out;
}
