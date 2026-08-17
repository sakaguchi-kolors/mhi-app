import { describe, expect, it } from 'vitest';
import {
  aggregateHeatmap,
  baselineOf,
  buildBuckets,
  levelOf,
  rowsInRange,
  spanOf,
  startOfWeekIndex,
  dayIndex,
  type HeatPartInput,
  type HeatRoutingInput,
} from './heatmap.logic';
import type { HeatThresholds } from '../shared/types';

const T: HeatThresholds = { warn: 1.2, alert: 1.5, crit: 2, minCount: 3, absWarn: 0, absAlert: 0, absCrit: 0 };
const d = (s: string): Date => new Date(`${s}T00:00:00`);
const resolveName = (shop: string): string => `Shop ${shop}`;

const row = (o: Partial<HeatRoutingInput> & { osId: string; shop: string }): HeatRoutingInput => ({
  job: '0000',
  planStart: null,
  planEnd: null,
  wip: false,
  ...o,
});

describe('startOfWeekIndex', () => {
  it('週の起点を月曜に揃える', () => {
    // 2026-08-14 は金曜。その週の月曜は 2026-08-10。
    expect(startOfWeekIndex(d('2026-08-14'))).toBe(dayIndex(d('2026-08-10')));
    expect(startOfWeekIndex(d('2026-08-10'))).toBe(dayIndex(d('2026-08-10')));
    expect(startOfWeekIndex(d('2026-08-16'))).toBe(dayIndex(d('2026-08-10')));
    expect(startOfWeekIndex(d('2026-08-17'))).toBe(dayIndex(d('2026-08-17')));
  });
});

describe('buildBuckets', () => {
  it('週バケットは月曜始まり・日曜終わりで連続する', () => {
    const b = buildBuckets(d('2026-08-14'), 'week', 3);
    expect(b.map((x) => [x.from, x.to])).toEqual([
      ['2026-08-10', '2026-08-16'],
      ['2026-08-17', '2026-08-23'],
      ['2026-08-24', '2026-08-30'],
    ]);
    expect(b[1].label).toBe('8/17');
  });

  it('日バケットは基準日から1日ずつ', () => {
    const b = buildBuckets(d('2026-08-14'), 'day', 2);
    expect(b.map((x) => x.from)).toEqual(['2026-08-14', '2026-08-15']);
    expect(b[0].from).toBe(b[0].to);
  });
});

describe('spanOf', () => {
  it('arrival は着手予定日の一点', () => {
    const r = row({ osId: 'A', shop: '7P21', planStart: d('2026-08-18'), planEnd: d('2026-09-01') });
    expect(spanOf(r, 'arrival')).toEqual([dayIndex(d('2026-08-18')), dayIndex(d('2026-08-18'))]);
  });

  it('occupancy は着手から完了までの区間', () => {
    const r = row({ osId: 'A', shop: '7P21', planStart: d('2026-08-18'), planEnd: d('2026-09-01') });
    expect(spanOf(r, 'occupancy')).toEqual([dayIndex(d('2026-08-18')), dayIndex(d('2026-09-01'))]);
  });

  it('着手日が無ければ完了日で代替する', () => {
    const r = row({ osId: 'A', shop: '7P21', planEnd: d('2026-08-20') });
    expect(spanOf(r, 'arrival')).toEqual([dayIndex(d('2026-08-20')), dayIndex(d('2026-08-20'))]);
  });

  it('日付が全く無い行は対象外', () => {
    expect(spanOf(row({ osId: 'A', shop: '7P21' }), 'arrival')).toBeNull();
  });

  it('完了が着手より前でも区間として成立させる', () => {
    const r = row({ osId: 'A', shop: '7P21', planStart: d('2026-08-20'), planEnd: d('2026-08-18') });
    expect(spanOf(r, 'occupancy')).toEqual([dayIndex(d('2026-08-18')), dayIndex(d('2026-08-20'))]);
  });
});

describe('baselineOf', () => {
  it('件数0の期間を分母から外して平均を取る', () => {
    // 計画が先まで無い工程でも 0 に引きずられない
    expect(baselineOf([10, 0, 20, 0, 0, 0])).toBe(15);
  });

  it('全期間0なら1に丸めて0除算を避ける', () => {
    expect(baselineOf([0, 0, 0])).toBe(1);
    expect(baselineOf([])).toBe(1);
  });

  it('平常時が1件未満にならないようにする', () => {
    expect(baselineOf([1, 0, 0])).toBe(1);
  });
});

describe('levelOf', () => {
  it('0件は判定なし', () => {
    expect(levelOf(0, 10, T)).toBe('none');
  });

  it('母数が閾値未満でも件数があれば平常とする', () => {
    expect(levelOf(2, 10, T)).toBe('low');
    expect(levelOf(1, 1.0, T)).toBe('low');
  });

  it('平常時に対する倍率で段階が上がる', () => {
    expect(levelOf(5, 1.0, T)).toBe('low');
    expect(levelOf(5, 1.2, T)).toBe('warn');
    expect(levelOf(5, 1.5, T)).toBe('alert');
    expect(levelOf(5, 2.0, T)).toBe('crit');
  });

  it('絶対件数の閾値は既定（0）では効かない', () => {
    expect(levelOf(500, 1.0, T)).toBe('low');
  });

  it('絶対件数を設定すると相対判定と厳しい方が採られる', () => {
    const abs: HeatThresholds = { ...T, absWarn: 30, absAlert: 60, absCrit: 120 };
    expect(levelOf(20, 1.0, abs)).toBe('low');
    expect(levelOf(30, 1.0, abs)).toBe('warn');
    expect(levelOf(60, 1.0, abs)).toBe('alert');
    expect(levelOf(120, 1.0, abs)).toBe('crit');
    // 件数は少ないが平常時比が高いケースは相対判定が勝つ
    expect(levelOf(10, 2.5, abs)).toBe('crit');
    // 件数が母数未満なら絶対閾値に関わらず平常
    expect(levelOf(2, 1.0, { ...abs, absWarn: 1 })).toBe('low');
  });
});

describe('aggregateHeatmap', () => {
  const buckets = buildBuckets(d('2026-08-10'), 'week', 3);
  const colors: Record<string, HeatPartInput> = {
    A: { color: 'red', stagnant: 12 },
    B: { color: 'yellow', stagnant: 4 },
    C: { color: 'green', stagnant: 0 },
    D: { color: 'red', stagnant: 8 },
  };
  const partOf = (osId: string): HeatPartInput | undefined => colors[osId];

  it('着手予定日をバケットに割り当てて件数と色内訳を出す', () => {
    const rows = [
      row({ osId: 'A', shop: '7P21', planStart: d('2026-08-11') }),
      row({ osId: 'B', shop: '7P21', planStart: d('2026-08-12') }),
      row({ osId: 'C', shop: '7P21', planStart: d('2026-08-19') }),
    ];
    const [r] = aggregateHeatmap({ rows, buckets, mode: 'arrival', groupBy: 'shop', thresholds: T, partOf, resolveName });
    expect(r.cells.map((c) => c.count)).toEqual([2, 1, 0]);
    expect(r.cells[0]).toMatchObject({ red: 1, yellow: 1, green: 0 });
    expect(r.total).toBe(3);
  });

  it('同じ部品が同一SHOPに複数行あっても1件として数える', () => {
    const rows = [
      row({ osId: 'A', shop: '7P21', job: '0001', planStart: d('2026-08-11') }),
      row({ osId: 'A', shop: '7P21', job: '0002', planStart: d('2026-08-13') }),
    ];
    const [r] = aggregateHeatmap({ rows, buckets, mode: 'arrival', groupBy: 'shop', thresholds: T, partOf, resolveName });
    expect(r.cells[0].count).toBe(1);
  });

  it('groupBy=job なら JOB ごとに行が分かれる', () => {
    const rows = [
      row({ osId: 'A', shop: '7P21', job: '0001', planStart: d('2026-08-11') }),
      row({ osId: 'A', shop: '7P21', job: '0002', planStart: d('2026-08-11') }),
    ];
    const res = aggregateHeatmap({ rows, buckets, mode: 'arrival', groupBy: 'job', thresholds: T, partOf, resolveName });
    expect(res.map((r) => r.key).sort()).toEqual(['7P21::0001', '7P21::0002']);
  });

  it('occupancy は在席期間にまたがる全バケットで数える', () => {
    const rows = [row({ osId: 'A', shop: '7P21', planStart: d('2026-08-11'), planEnd: d('2026-08-25') })];
    const [r] = aggregateHeatmap({ rows, buckets, mode: 'occupancy', groupBy: 'shop', thresholds: T, partOf, resolveName });
    expect(r.cells.map((c) => c.count)).toEqual([1, 1, 1]);
  });

  it('平常時に対する突出をピークとして検出する', () => {
    // 1週目に4件、2〜3週目は1件ずつ → 平常時 2件 → 1週目は2倍で crit
    const rows = [
      ...['A', 'B', 'C', 'D'].map((id) => row({ osId: id, shop: '7P21', planStart: d('2026-08-11') })),
      row({ osId: 'A', shop: '7P21', planStart: d('2026-08-18') }),
      row({ osId: 'B', shop: '7P21', planStart: d('2026-08-25') }),
    ];
    const [r] = aggregateHeatmap({ rows, buckets, mode: 'arrival', groupBy: 'shop', thresholds: T, partOf, resolveName });
    expect(r.baseline).toBe(2);
    expect(r.activeBuckets).toBe(3);
    expect(r.cells[0].level).toBe('crit');
    expect(r.peakLevel).toBe('crit');
    // 件数が minCount 未満のセルは倍率が高くても混雑判定せず平常
    expect(r.cells[1].level).toBe('low');
  });

  it('計画が先まで無くても、空の期間に引きずられて過密判定にならない', () => {
    // 直近3週に4件ずつ、以降は予定なし。平常時は 4件 であって 0件 ではない
    const wide = buildBuckets(d('2026-08-10'), 'week', 8);
    const ids = ['A', 'B', 'C', 'D'];
    const rows = [
      ...ids.map((id) => row({ osId: id, shop: '7P21', planStart: d('2026-08-11') })),
      ...ids.map((id) => row({ osId: id, shop: '7P21', planStart: d('2026-08-18') })),
      ...ids.map((id) => row({ osId: id, shop: '7P21', planStart: d('2026-08-25') })),
    ];
    const [r] = aggregateHeatmap({
      rows,
      buckets: wide,
      mode: 'arrival',
      groupBy: 'shop',
      thresholds: T,
      partOf,
      resolveName,
    });
    expect(r.baseline).toBe(4);
    expect(r.cells.slice(0, 3).map((c) => c.level)).toEqual(['low', 'low', 'low']);
    expect(r.cells.slice(3).every((c) => c.level === 'none')).toBe(true);
    expect(r.peakLevel).toBe('low');
  });

  it('仕掛中の件数と平均滞留日数を集計する', () => {
    const rows = [
      row({ osId: 'A', shop: '7P21', wip: true, planStart: d('2026-08-11') }),
      row({ osId: 'D', shop: '7P21', wip: true, planStart: d('2026-08-11') }),
    ];
    const [r] = aggregateHeatmap({ rows, buckets, mode: 'arrival', groupBy: 'shop', thresholds: T, partOf, resolveName });
    expect(r.wipCount).toBe(2);
    expect(r.avgStagnant).toBe(10);
  });

  it('混雑水準が高い順に並ぶ（突出のある工程が、常に忙しいだけの工程より上）', () => {
    const rows = [
      ...['A', 'B', 'C', 'D'].map((id) => row({ osId: id, shop: 'HOT', planStart: d('2026-08-11') })),
      row({ osId: 'A', shop: 'HOT', planStart: d('2026-08-18') }),
      row({ osId: 'B', shop: 'HOT', planStart: d('2026-08-25') }),
      ...['A', 'B', 'C'].map((id) => row({ osId: id, shop: 'FLAT', planStart: d('2026-08-11') })),
      ...['A', 'B', 'C'].map((id) => row({ osId: id, shop: 'FLAT', planStart: d('2026-08-18') })),
      ...['A', 'B', 'C'].map((id) => row({ osId: id, shop: 'FLAT', planStart: d('2026-08-25') })),
    ];
    const res = aggregateHeatmap({ rows, buckets, mode: 'arrival', groupBy: 'shop', thresholds: T, partOf, resolveName });
    expect(res.map((r) => r.key)).toEqual(['HOT', 'FLAT']);
  });

  it('期間内に予定も仕掛も無いSHOPは行に出さない', () => {
    const rows = [row({ osId: 'A', shop: '7P21', planStart: d('2027-01-01') })];
    const res = aggregateHeatmap({ rows, buckets, mode: 'arrival', groupBy: 'shop', thresholds: T, partOf, resolveName });
    expect(res).toEqual([]);
  });
});

describe('rowsInRange', () => {
  it('指定期間に掛かる行だけを残す', () => {
    const rows = [
      row({ osId: 'A', shop: '7P21', planStart: d('2026-08-11') }),
      row({ osId: 'B', shop: '7P21', planStart: d('2026-09-01') }),
    ];
    const res = rowsInRange(rows, 'arrival', dayIndex(d('2026-08-10')), dayIndex(d('2026-08-16')));
    expect(res.map((r) => r.osId)).toEqual(['A']);
  });
});
