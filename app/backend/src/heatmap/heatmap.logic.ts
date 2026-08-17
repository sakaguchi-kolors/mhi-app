// 工程ヒートマップの集計ロジック（純関数・DB非依存）。
// 「いつ・どの工程に・何件の部品が集中しそうか」を時間バケットごとに数える。
import type {
  Color,
  HeatBucket,
  HeatCell,
  HeatGroupBy,
  HeatLevel,
  HeatMode,
  HeatRow,
  HeatThresholds,
  HeatUnit,
} from '../shared/types';

export const HEAT_LEVEL_RANK: Record<HeatLevel, number> = {
  none: 0,
  low: 1,
  warn: 2,
  alert: 3,
  crit: 4,
};

/** 工程1行。t_routing の未完了行を想定 */
export interface HeatRoutingInput {
  osId: string;
  shop: string;
  job: string;
  planStart: Date | null;
  planEnd: Date | null;
  wip: boolean;
}

/** 部品の緊急度。t_part_status から引く */
export interface HeatPartInput {
  color: Color;
  stagnant: number;
  /** groupBy=part の行見出しに使う */
  partNo?: string;
  name?: string;
  inst?: string;
}

/** 部品単位の行では混雑度ではなく、その部品自身の緊急度で塗る */
const COLOR_LEVEL: Record<Color, HeatLevel> = { red: 'crit', yellow: 'alert', green: 'low' };

/** バケットを日インデックス（1970-01-01 からの経過日数）で保持した内部表現 */
export interface BucketRange extends HeatBucket {
  fromIdx: number;
  toIdx: number;
}

/** ローカル日付を日インデックスへ。時刻・タイムゾーン差を落とす */
export function dayIndex(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function fromDayIndex(i: number): Date {
  const d = new Date(i * 86400000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function ymdOf(i: number): string {
  const d = fromDayIndex(i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mdOf(i: number): string {
  const d = fromDayIndex(i);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 月曜始まりの週頭 */
export function startOfWeekIndex(d: Date): number {
  const i = dayIndex(d);
  // 1970-01-01 は木曜。(i + 3) % 7 が 0 のとき月曜。
  return i - ((i + 3) % 7);
}

export function buildBuckets(asOf: Date, unit: HeatUnit, count: number): BucketRange[] {
  const span = unit === 'week' ? 7 : 1;
  const start = unit === 'week' ? startOfWeekIndex(asOf) : dayIndex(asOf);
  const buckets: BucketRange[] = [];
  for (let n = 0; n < count; n++) {
    const fromIdx = start + n * span;
    const toIdx = fromIdx + span - 1;
    buckets.push({ fromIdx, toIdx, from: ymdOf(fromIdx), to: ymdOf(toIdx), label: mdOf(fromIdx) });
  }
  return buckets;
}

/**
 * 工程行が占める期間を日インデックスの範囲で返す。
 * arrival は着手予定日の一点、occupancy は着手〜完了の区間。
 */
export function spanOf(row: HeatRoutingInput, mode: HeatMode): [number, number] | null {
  const start = row.planStart ?? row.planEnd;
  if (!start) return null;
  if (mode === 'arrival') {
    const i = dayIndex(start);
    return [i, i];
  }
  const end = row.planEnd ?? row.planStart;
  if (!end) return null;
  const a = dayIndex(start);
  const b = dayIndex(end);
  return a <= b ? [a, b] : [b, a];
}

/**
 * 平常値＝「実際に部品が入る期間」の平均件数。
 * 計画は数週間先までしか無く、遠い週はほぼ0になる。全期間の平均や中央値を分母にすると
 * 0 に張り付いて全セルが過密判定になるため、件数0の期間は分母から外す。
 */
export function baselineOf(counts: number[]): number {
  const active = counts.filter((c) => c > 0);
  if (!active.length) return 1;
  const mean = active.reduce((a, b) => a + b, 0) / active.length;
  return Math.max(Math.round(mean * 10) / 10, 1);
}

/** 絶対件数による判定。閾値0は「使わない」を意味する */
function absoluteLevel(count: number, t: HeatThresholds): HeatLevel {
  if (t.absCrit > 0 && count >= t.absCrit) return 'crit';
  if (t.absAlert > 0 && count >= t.absAlert) return 'alert';
  if (t.absWarn > 0 && count >= t.absWarn) return 'warn';
  return 'low';
}

/** 相対（平常時比）と絶対（件数）の厳しい方を採る。件数ありで母数未満は混雑判定せず平常 */
export function levelOf(count: number, ratio: number, t: HeatThresholds): HeatLevel {
  if (count <= 0) return 'none';
  if (count < t.minCount) return 'low';
  const rel: HeatLevel = ratio >= t.crit ? 'crit' : ratio >= t.alert ? 'alert' : ratio >= t.warn ? 'warn' : 'low';
  const abs = absoluteLevel(count, t);
  return HEAT_LEVEL_RANK[abs] > HEAT_LEVEL_RANK[rel] ? abs : rel;
}

export function heatRowKey(shop: string, job: string, groupBy: HeatGroupBy): string {
  return groupBy === 'job' ? `${shop}::${job}` : shop;
}

/**
 * 部品単位の行。縦軸を部品、横軸を期間にした「その部品がいつどこに居る予定か」の帯。
 * 件数の混雑度ではなく部品自身の色で塗るので、工程単位とは意味が違う。
 * セルには滞在する工程コードを入れる。
 */
function aggregateByPart(input: AggregateInput): HeatRow[] {
  const { rows, buckets, mode, partOf } = input;

  type Acc = { shops: Set<string>[]; wip: boolean; shopSeen: Set<string> };
  const acc = new Map<string, Acc>();

  for (const row of rows) {
    if (!row.shop) continue;
    let a = acc.get(row.osId);
    if (!a) {
      a = { shops: buckets.map(() => new Set<string>()), wip: false, shopSeen: new Set<string>() };
      acc.set(row.osId, a);
    }
    if (row.wip) a.wip = true;
    const span = spanOf(row, mode);
    if (!span) continue;
    const [s, e] = span;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (e >= b.fromIdx && s <= b.toIdx) {
        a.shops[i].add(row.shop);
        a.shopSeen.add(row.shop);
      }
    }
  }

  const result: HeatRow[] = [];
  for (const [osId, a] of acc) {
    const p = partOf(osId);
    const color: Color = p?.color ?? 'green';
    const level = COLOR_LEVEL[color];
    const cells: HeatCell[] = a.shops.map((set) => {
      const count = set.size;
      if (count === 0) return { count: 0, red: 0, yellow: 0, green: 0, ratio: 0, level: 'none' as HeatLevel };
      return {
        count,
        red: color === 'red' ? count : 0,
        yellow: color === 'yellow' ? count : 0,
        green: color === 'green' ? count : 0,
        ratio: 1,
        level,
        label: [...set].sort().join(','),
      };
    });
    const active = cells.filter((c) => c.count > 0).length;
    if (active === 0 && !a.wip) continue;

    result.push({
      key: osId,
      osId,
      shop: [...a.shopSeen][0] ?? '',
      name: p?.name || osId,
      sub: `${p?.partNo ?? ''}${p?.inst ? ` #${p.inst}` : ''}`.trim() || osId,
      wipCount: a.wip ? 1 : 0,
      avgStagnant: p?.stagnant ?? 0,
      baseline: 1,
      basis: 'mean',
      activeBuckets: active,
      peakRatio: 1,
      peakLevel: level,
      total: cells.reduce((x, c) => x + c.count, 0),
      cells,
    });
  }

  result.sort(
    (x, y) =>
      HEAT_LEVEL_RANK[y.peakLevel] - HEAT_LEVEL_RANK[x.peakLevel] ||
      y.avgStagnant - x.avgStagnant ||
      x.key.localeCompare(y.key),
  );
  return result;
}

export interface AggregateInput {
  rows: HeatRoutingInput[];
  buckets: BucketRange[];
  mode: HeatMode;
  groupBy: HeatGroupBy;
  thresholds: HeatThresholds;
  partOf: (osId: string) => HeatPartInput | undefined;
  resolveName: (shop: string, job: string) => string;
}

/** 混雑度が高い順（ピーク水準 → ピーク倍率 → 現在の仕掛数）に並べた行を返す */
export function aggregateHeatmap(input: AggregateInput): HeatRow[] {
  const { rows, buckets, mode, groupBy, thresholds, partOf, resolveName } = input;
  if (groupBy === 'part') return aggregateByPart(input);

  type Acc = { shop: string; job: string; buckets: Set<string>[]; wip: Set<string> };
  const acc = new Map<string, Acc>();
  const touch = (shop: string, job: string): Acc => {
    const key = heatRowKey(shop, job, groupBy);
    let a = acc.get(key);
    if (!a) {
      a = { shop, job, buckets: buckets.map(() => new Set<string>()), wip: new Set<string>() };
      acc.set(key, a);
    }
    return a;
  };

  for (const row of rows) {
    if (!row.shop) continue;
    const a = touch(row.shop, row.job);
    if (row.wip) a.wip.add(row.osId);
    const span = spanOf(row, mode);
    if (!span) continue;
    const [s, e] = span;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (e >= b.fromIdx && s <= b.toIdx) a.buckets[i].add(row.osId);
    }
  }

  const result: HeatRow[] = [];
  for (const [key, a] of acc) {
    const counts = a.buckets.map((s) => s.size);
    if (!counts.some((c) => c > 0) && a.wip.size === 0) continue;

    // 平常値は自分自身から求める。SHOP の規模差を吸収するため。
    const activeBuckets = counts.filter((c) => c > 0).length;
    const baseline = baselineOf(counts);

    const cells: HeatCell[] = a.buckets.map((set) => {
      let red = 0;
      let yellow = 0;
      let green = 0;
      for (const osId of set) {
        const c = partOf(osId)?.color;
        if (c === 'red') red++;
        else if (c === 'yellow') yellow++;
        else green++;
      }
      const count = set.size;
      const ratio = Math.round((count / baseline) * 100) / 100;
      return { count, red, yellow, green, ratio, level: levelOf(count, ratio, thresholds) };
    });

    let peakRatio = 0;
    let peakLevel: HeatLevel = 'none';
    for (const c of cells) {
      if (c.level === 'none') continue;
      if (HEAT_LEVEL_RANK[c.level] > HEAT_LEVEL_RANK[peakLevel]) peakLevel = c.level;
      if (c.ratio > peakRatio) peakRatio = c.ratio;
    }

    let stagSum = 0;
    for (const osId of a.wip) stagSum += partOf(osId)?.stagnant ?? 0;
    const avgStagnant = a.wip.size ? Math.round((stagSum / a.wip.size) * 10) / 10 : 0;

    result.push({
      key,
      shop: a.shop,
      job: groupBy === 'job' ? a.job : undefined,
      name: resolveName(a.shop, a.job),
      sub: groupBy === 'job' ? `${a.shop} / ${a.job}` : a.shop,
      wipCount: a.wip.size,
      avgStagnant,
      baseline,
      basis: 'mean',
      activeBuckets,
      peakRatio,
      peakLevel,
      total: counts.reduce((x, y) => x + y, 0),
      cells,
    });
  }

  result.sort(
    (x, y) =>
      HEAT_LEVEL_RANK[y.peakLevel] - HEAT_LEVEL_RANK[x.peakLevel] ||
      y.peakRatio - x.peakRatio ||
      y.wipCount - x.wipCount ||
      y.avgStagnant - x.avgStagnant ||
      x.key.localeCompare(y.key),
  );
  return result;
}

/** ドリルダウン用：指定期間に該当する工程行だけを抜き出す */
export function rowsInRange(
  rows: HeatRoutingInput[],
  mode: HeatMode,
  fromIdx: number,
  toIdx: number,
): HeatRoutingInput[] {
  return rows.filter((r) => {
    const span = spanOf(r, mode);
    if (!span) return false;
    return span[1] >= fromIdx && span[0] <= toIdx;
  });
}
