import { describe, expect, it } from 'vitest';
import type { HeatBucket, HeatCell, HeatRow } from '../types';
import { bucketLabel, cellClass, cellShares, cellTitle, peakBucket } from './heatmap.view';

const bucket = (from: string, to: string, label: string): HeatBucket => ({ from, to, label });
const cell = (o: Partial<HeatCell>): HeatCell => ({
  count: 0,
  red: 0,
  yellow: 0,
  green: 0,
  ratio: 0,
  level: 'none',
  ...o,
});
const row = (cells: HeatCell[], o: Partial<HeatRow> = {}): HeatRow => ({
  key: '7P21',
  shop: '7P21',
  name: '機械加工',
  sub: '7P21',
  wipCount: 0,
  avgStagnant: 0,
  baseline: 4,
  basis: 'mean',
  activeBuckets: 6,
  peakRatio: 0,
  peakLevel: 'none',
  total: 0,
  cells,
  ...o,
});

describe('bucketLabel', () => {
  it('週は「週」を付け、日はそのまま', () => {
    expect(bucketLabel(bucket('2026-08-17', '2026-08-23', '8/17'), 'week')).toBe('8/17週');
    expect(bucketLabel(bucket('2026-08-17', '2026-08-17', '8/17'), 'day')).toBe('8/17');
  });
});

describe('cellClass', () => {
  it('件数0は予定なし色、それ以外は水準クラス', () => {
    expect(cellClass(cell({}))).toBe('heat-cell lv-empty');
    expect(cellClass(cell({ count: 5, level: 'alert' }))).toBe('heat-cell lv-alert');
  });
});

describe('cellShares', () => {
  it('色内訳を比率に直す', () => {
    expect(cellShares(cell({ count: 4, red: 1, yellow: 1, green: 2 }))).toEqual({ red: 25, yellow: 25, green: 50 });
  });

  it('件数0でも0除算しない', () => {
    expect(cellShares(cell({}))).toEqual({ red: 0, yellow: 0, green: 0 });
  });
});

describe('cellTitle', () => {
  const b = bucket('2026-08-17', '2026-08-23', '8/17');

  it('予定なしのセルはその旨だけ返す', () => {
    expect(cellTitle(row([]), b, cell({}), 'week')).toContain('予定なし');
  });

  it('件数・色内訳・判定根拠を含む', () => {
    const t = cellTitle(row([]), b, cell({ count: 9, red: 4, yellow: 3, green: 2, ratio: 2.25, level: 'crit' }), 'week');
    expect(t).toContain('9件（赤4 黄3 緑2）');
    expect(t).toContain('過密（平常時 4件 の 2.25倍）');
  });

  it('件数ありで判定なしのセルは平常として扱う', () => {
    const t = cellTitle(row([]), b, cell({ count: 2, green: 2, ratio: 0.5, level: 'none' }), 'week');
    expect(t).toContain('平常（件数が少なく混雑判定なし）');
  });
});

describe('peakBucket', () => {
  const buckets = [
    bucket('2026-08-10', '2026-08-16', '8/10'),
    bucket('2026-08-17', '2026-08-23', '8/17'),
    bucket('2026-08-24', '2026-08-30', '8/24'),
  ];

  it('もっとも倍率が高い期間を返す', () => {
    const r = row([
      cell({ count: 5, ratio: 1.25, level: 'warn' }),
      cell({ count: 9, ratio: 2.25, level: 'crit' }),
      cell({ count: 4, ratio: 1.0, level: 'low' }),
    ]);
    expect(peakBucket(r, buckets, 'week')).toBe('8/17週');
  });

  it('平常・判定なししか無ければ null', () => {
    const r = row([cell({ count: 4, ratio: 1, level: 'low' }), cell({ count: 1, ratio: 0.25, level: 'none' })]);
    expect(peakBucket(r, buckets, 'week')).toBeNull();
  });
});
