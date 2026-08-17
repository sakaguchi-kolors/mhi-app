import { describe, expect, it } from 'vitest';
import {
  buildPartCongestion,
  congestionLevel,
  plansOverlap,
  sortBatting,
  type CongestionPartInput,
} from './part-congestion.logic';

const d = (s: string): Date => new Date(`${s}T00:00:00`);

const p = (o: Partial<CongestionPartInput> & { osId: string; shop: string }): CongestionPartInput => ({
  color: 'green',
  buffer: 0,
  daysLeft: 0,
  partNo: o.osId,
  name: o.osId,
  ...o,
});

describe('congestionLevel', () => {
  it('件数で緑／黄／赤を分ける', () => {
    expect(congestionLevel(0)).toBe('green');
    expect(congestionLevel(29)).toBe('green');
    expect(congestionLevel(30)).toBe('yellow');
    expect(congestionLevel(49)).toBe('yellow');
    expect(congestionLevel(50)).toBe('red');
  });
});

describe('sortBatting', () => {
  it('残日数が多い順。緑が上に来てよい', () => {
    const rows = [
      p({ osId: 'R', shop: 'A', color: 'red', daysLeft: 3 }),
      p({ osId: 'G', shop: 'A', color: 'green', daysLeft: 40 }),
      p({ osId: 'Y', shop: 'A', color: 'yellow', daysLeft: 12 }),
    ];
    expect(sortBatting(rows).map((x) => x.osId)).toEqual(['G', 'Y', 'R']);
  });
});

describe('plansOverlap', () => {
  it('1日でも重なればバッティング', () => {
    expect(
      plansOverlap(
        { planStart: d('2026-07-01'), planEnd: d('2026-07-05') },
        { planStart: d('2026-07-05'), planEnd: d('2026-07-10') },
      ),
    ).toBe(true);
  });

  it('翌日始まりは重ならない', () => {
    expect(
      plansOverlap(
        { planStart: d('2026-07-01'), planEnd: d('2026-07-05') },
        { planStart: d('2026-07-06'), planEnd: d('2026-07-10') },
      ),
    ).toBe(false);
  });

  it('日付が無い側はバッティングにしない', () => {
    expect(plansOverlap({ planStart: d('2026-07-01'), planEnd: d('2026-07-05') }, { planStart: null, planEnd: null })).toBe(
      false,
    );
  });
});

describe('buildPartCongestion', () => {
  it('後続SHOPごとに着手数と色内訳を出す', () => {
    const result = buildPartCongestion({
      osId: 'SELF',
      steps: [
        { shop: '8209', name: '外注表面処理' },
        { shop: '7P32', name: '受入検査' },
      ],
      parts: [
        p({ osId: 'SELF', shop: '8209', color: 'red', buffer: -7, planStart: d('2026-07-01'), planEnd: d('2026-07-10') }),
        p({ osId: 'A', shop: '8209', color: 'red', buffer: -3, daysLeft: 5, planStart: d('2026-07-08'), planEnd: d('2026-07-12') }),
        p({ osId: 'B', shop: '8209', color: 'yellow', buffer: 0, daysLeft: 20, planStart: d('2026-07-10'), planEnd: d('2026-07-11') }),
        p({ osId: 'C', shop: '8209', color: 'green', buffer: 4, planStart: d('2026-08-01'), planEnd: d('2026-08-05') }),
        p({ osId: 'SELF', shop: '7P32', color: 'red', planStart: d('2026-07-20'), planEnd: d('2026-07-22') }),
        p({ osId: 'D', shop: '7P32', color: 'green', buffer: 2, planStart: d('2026-07-22'), planEnd: d('2026-07-25') }),
      ],
    });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toMatchObject({
      step: 1,
      shop: '8209',
      name: '外注表面処理',
      started: 4,
      red: 2,
      yellow: 1,
      green: 1,
      redPct: 50,
      yellowPct: 25,
      greenPct: 25,
      level: 'green',
    });
    expect(result.steps[0].batting.map((b) => b.id)).toEqual(['B', 'A']);
    expect(result.steps[1].started).toBe(2);
    expect(result.steps[1].batting.map((b) => b.id)).toEqual(['D']);
  });

  it('同一SHOPは先に出た工程だけ残す', () => {
    const result = buildPartCongestion({
      osId: 'SELF',
      steps: [
        { shop: '7P21', name: '検査1' },
        { shop: '7P21', name: '検査2' },
      ],
      parts: [p({ osId: 'A', shop: '7P21', color: 'red' })],
    });
    expect(result.steps.map((s) => s.name)).toEqual(['検査1']);
  });

  it('バッティングは残日数が多い4件だけ残し、残り件数を出す', () => {
    const parts = [
      p({ osId: 'SELF', shop: 'A', planStart: d('2026-07-01'), planEnd: d('2026-07-31') }),
      ...Array.from({ length: 6 }, (_, i) =>
        p({
          osId: `R${i}`,
          shop: 'A',
          color: 'red',
          daysLeft: i,
          planStart: d('2026-07-10'),
          planEnd: d('2026-07-12'),
        }),
      ),
    ];
    const result = buildPartCongestion({
      osId: 'SELF',
      steps: [{ shop: 'A', name: '加工' }],
      parts,
      battingLimit: 4,
    });
    expect(result.steps[0].batting.map((b) => b.id)).toEqual(['R5', 'R4', 'R3', 'R2']);
    expect(result.steps[0].battingMore).toBe(2);
  });

  it('同一部品が同じSHOPに複数行あっても1件', () => {
    const result = buildPartCongestion({
      osId: 'SELF',
      steps: [{ shop: 'A', name: '加工' }],
      parts: [p({ osId: 'X', shop: 'A' }), p({ osId: 'X', shop: 'A' })],
    });
    expect(result.steps[0].started).toBe(1);
  });
});
