// ヒートマップの表示ラベル・ツールチップ文言。集計はバックエンド側。
import type { HeatBucket, HeatCell, HeatLevel, HeatRow, HeatUnit } from '../types';

export const HEAT_LEVEL_LABEL: Record<HeatLevel, string> = {
  none: '判定なし',
  low: '平常',
  warn: 'やや混雑',
  alert: '混雑',
  crit: '過密',
};

export const HEAT_MODE_LABEL = {
  arrival: '流入（着手予定）',
  occupancy: '在席（工程滞在）',
} as const;

/** 期間の見出し。週は「8/17週」、日は「8/17」 */
export function bucketLabel(b: HeatBucket, unit: HeatUnit): string {
  return unit === 'week' ? `${b.label}週` : b.label;
}

/** セルの塗り分けクラス。件数0も「予定なし」の色で必ず塗る（マップとして隙間を作らない） */
export function cellClass(cell: HeatCell): string {
  if (cell.count === 0) return 'heat-cell lv-empty';
  return `heat-cell lv-${cell.level}`;
}

/** 積み上げバーの各色の比率（%） */
export function cellShares(cell: HeatCell): { red: number; yellow: number; green: number } {
  if (cell.count === 0) return { red: 0, yellow: 0, green: 0 };
  const pct = (n: number): number => Math.round((n / cell.count) * 100);
  return { red: pct(cell.red), yellow: pct(cell.yellow), green: pct(cell.green) };
}

export function cellTitle(row: HeatRow, bucket: HeatBucket, cell: HeatCell, unit: HeatUnit): string {
  const head = `${row.name}（${row.sub}） ${bucketLabel(bucket, unit)}`;
  if (cell.count === 0) return `${head}\n予定なし`;
  if (row.osId) {
    return `${head}\n滞在予定の工程：${cell.label ?? '—'}\nクリックで部品詳細`;
  }
  const judge =
    cell.level === 'none'
      ? '平常（件数が少なく混雑判定なし）'
      : `${HEAT_LEVEL_LABEL[cell.level]}（平常時 ${row.baseline}件 の ${cell.ratio}倍）`;
  const basis = `平常時は予定のある${row.activeBuckets}期間の平均`;
  return `${head}\n${cell.count}件（赤${cell.red} 黄${cell.yellow} 緑${cell.green}）\n${judge}\n${basis}\nクリックで部品一覧`;
}

/** 一番混んでいる期間。判定なしのセルは無視する */
export function peakBucket(row: HeatRow, buckets: HeatBucket[], unit: HeatUnit): string | null {
  let best = -1;
  let bestRatio = 0;
  row.cells.forEach((c, i) => {
    if (c.level === 'none' || c.level === 'low') return;
    if (c.ratio > bestRatio) {
      bestRatio = c.ratio;
      best = i;
    }
  });
  return best >= 0 && buckets[best] ? bucketLabel(buckets[best], unit) : null;
}
