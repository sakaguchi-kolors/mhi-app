import { describe, expect, it } from 'vitest';
import {
  aggregateShopLt,
  buildShopLtMap,
  collectLtSamples,
  medianOf,
  percentile,
  recommendLtDays,
  type LtRoutingRow,
  type ShopLtStatRow,
} from './lt.logic';

const d = (s: string): Date => new Date(`${s}T00:00:00`);
const OPT = { maxDays: 365 };

const r = (seq: number, shop: string, actualEnd: string | null, hs: number | null = null): LtRoutingRow => ({
  osId: 'X1',
  seq,
  shop,
  actualEnd: actualEnd ? d(actualEnd) : null,
  hs,
});

describe('percentile', () => {
  it('空配列は0', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it('1要素はその値', () => {
    expect(percentile([7], 0.9)).toBe(7);
  });

  it('線形補間する', () => {
    expect(percentile([0, 10], 0.5)).toBe(5);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 1)).toBe(4);
  });
});

describe('medianOf', () => {
  it('空は null', () => {
    expect(medianOf([])).toBeNull();
  });

  it('未ソートでも中央値を返す', () => {
    expect(medianOf([5, 1, 3])).toBe(3);
  });
});

describe('collectLtSamples', () => {
  it('前工程完了→当工程完了のインターバルを取る', () => {
    const rows = [r(1, 'A', '2026-01-01'), r(2, 'B', '2026-01-05'), r(3, 'C', '2026-01-11')];
    expect(collectLtSamples(rows, OPT)).toEqual([
      { shop: 'B', days: 4 },
      { shop: 'C', days: 6 },
    ]);
  });

  it('先頭工程はサンプルにしない', () => {
    const rows = [r(1, 'A', '2026-01-01')];
    expect(collectLtSamples(rows, OPT)).toEqual([]);
  });

  it('連続する同一SHOPは1コマに圧縮する', () => {
    // A → B(3行) の B は、最後の行の完了日で1サンプル
    const rows = [r(1, 'A', '2026-01-01'), r(2, 'B', '2026-01-03'), r(3, 'B', '2026-01-04'), r(4, 'B', '2026-01-08')];
    expect(collectLtSamples(rows, OPT)).toEqual([{ shop: 'B', days: 7 }]);
  });

  it('コマ内に未完了行があればそのコマは使わない', () => {
    const rows = [r(1, 'A', '2026-01-01'), r(2, 'B', '2026-01-03'), r(3, 'B', null), r(4, 'C', '2026-01-10')];
    expect(collectLtSamples(rows, OPT)).toEqual([]);
  });

  it('実績が飛んでいる区間は前後をつながない', () => {
    const rows = [r(1, 'A', '2026-01-01'), r(2, 'B', null), r(3, 'C', '2026-01-20')];
    expect(collectLtSamples(rows, OPT)).toEqual([]);
  });

  it('同日完了は0日として数える', () => {
    const rows = [r(1, 'A', '2026-01-01'), r(2, 'B', '2026-01-01')];
    expect(collectLtSamples(rows, OPT)).toEqual([{ shop: 'B', days: 0 }]);
  });

  it('逆行（負のインターバル）と異常に長い区間は除外する', () => {
    const back = [r(1, 'A', '2026-01-10'), r(2, 'B', '2026-01-01')];
    expect(collectLtSamples(back, OPT)).toEqual([]);
    const long = [r(1, 'A', '2024-01-01'), r(2, 'B', '2026-01-01')];
    expect(collectLtSamples(long, OPT)).toEqual([]);
    expect(collectLtSamples(long, { maxDays: 3650 })).toEqual([{ shop: 'B', days: 731 }]);
  });

  it('seq が未ソートでも順序を復元する', () => {
    const rows = [r(3, 'C', '2026-01-11'), r(1, 'A', '2026-01-01'), r(2, 'B', '2026-01-05')];
    expect(collectLtSamples(rows, OPT).map((s) => s.shop)).toEqual(['B', 'C']);
  });

  it('休日を除いた稼働日で数える', () => {
    const rows = [r(1, 'A', '2026-01-01'), r(2, 'B', '2026-01-08')];
    const holidays = new Set(['2026-01-03', '2026-01-04']);
    expect(collectLtSamples(rows, { ...OPT, holidays })).toEqual([{ shop: 'B', days: 5 }]);
  });

  it('SHOP 空欄の行は無視する', () => {
    const rows = [r(1, 'A', '2026-01-01'), r(2, '', '2026-01-02'), r(3, 'B', '2026-01-06')];
    expect(collectLtSamples(rows, OPT)).toEqual([{ shop: 'B', days: 5 }]);
  });
});

describe('aggregateShopLt', () => {
  it('SHOP別に分位点を出し、件数降順で返す', () => {
    const samples = [
      ...[1, 2, 3, 4].map((days) => ({ shop: 'A', days })),
      { shop: 'B', days: 10 },
    ];
    const rows = aggregateShopLt(samples);
    expect(rows.map((x) => x.shop)).toEqual(['A', 'B']);
    expect(rows[0]).toEqual({ shop: 'A', n: 4, p50: 2.5, p75: 3.3, p90: 3.7, mean: 2.5, hsMedian: null });
    expect(rows[1]).toMatchObject({ shop: 'B', n: 1, p50: 10, p90: 10 });
  });

  it('Hs 中央値を参考値として付ける', () => {
    const rows = aggregateShopLt([{ shop: 'A', days: 1 }], new Map([['A', [1, 2, 9]]]));
    expect(rows[0].hsMedian).toBe(2);
  });

  it('サンプルが無ければ空', () => {
    expect(aggregateShopLt([])).toEqual([]);
  });
});

describe('recommendLtDays', () => {
  const stat = (o: Partial<ShopLtStatRow>): ShopLtStatRow => ({
    shop: 'A',
    n: 30,
    p50: 3.4,
    p75: 8.6,
    p90: 20,
    mean: 7,
    hsMedian: null,
    ...o,
  });

  it('指定分位点を四捨五入して返す', () => {
    expect(recommendLtDays(stat({}), 'p50', 10)).toBe(3);
    expect(recommendLtDays(stat({}), 'p75', 10)).toBe(9);
  });

  it('サンプル不足なら推奨しない', () => {
    expect(recommendLtDays(stat({ n: 9 }), 'p50', 10)).toBeNull();
  });

  it('0日にはせず下限1日にする', () => {
    expect(recommendLtDays(stat({ p50: 0 }), 'p50', 10)).toBe(1);
  });
});

describe('buildShopLtMap', () => {
  const stats: ShopLtStatRow[] = [
    { shop: 'A', n: 30, p50: 8, p75: 9, p90: 16, mean: 8.3, hsMedian: null },
    { shop: 'B', n: 2, p50: 1, p75: 1, p90: 1, mean: 1, hsMedian: null },
  ];

  it('fixed は手入力のみを返す', () => {
    const m = buildShopLtMap('fixed', new Map([['Z', 6]]), stats, 'p50', 10);
    expect([...m]).toEqual([['Z', 6]]);
  });

  it('actual は実績を入れつつサンプル不足SHOPは入れない', () => {
    const m = buildShopLtMap('actual', new Map(), stats, 'p50', 10);
    expect(m.get('A')).toBe(8);
    expect(m.has('B')).toBe(false);
  });

  it('actual でも手入力があればそちらを優先する', () => {
    const m = buildShopLtMap('actual', new Map([['A', 2]]), stats, 'p50', 10);
    expect(m.get('A')).toBe(2);
  });
});
