import { describe, expect, it } from 'vitest';
import {
  buildPartCongestion,
  congestionLevel,
  sortBatting,
  type CongestionPartInput,
} from './part-congestion.logic';

const p = (o: Partial<CongestionPartInput> & { osId: string; shop: string }): CongestionPartInput => ({
  color: 'green',
  buffer: 0,
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
  it('赤→黄→緑、同色ならバッファが小さい順', () => {
    const rows = [
      p({ osId: 'G', shop: 'A', color: 'green', buffer: -2 }),
      p({ osId: 'R2', shop: 'A', color: 'red', buffer: 1 }),
      p({ osId: 'R1', shop: 'A', color: 'red', buffer: -4 }),
      p({ osId: 'Y', shop: 'A', color: 'yellow', buffer: 0 }),
    ];
    expect(sortBatting(rows).map((x) => x.osId)).toEqual(['R1', 'R2', 'Y', 'G']);
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
        p({ osId: 'SELF', shop: '8209', color: 'red', buffer: -7 }),
        p({ osId: 'A', shop: '8209', color: 'red', buffer: -3 }),
        p({ osId: 'B', shop: '8209', color: 'yellow', buffer: 0 }),
        p({ osId: 'C', shop: '8209', color: 'green', buffer: 4 }),
        p({ osId: 'D', shop: '7P32', color: 'green', buffer: 2 }),
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
    expect(result.steps[0].batting.map((b) => b.id)).toEqual(['A', 'B', 'C']);
    expect(result.steps[1].started).toBe(1);
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

  it('バッティングは上位だけ残し、出し切れない赤を数える', () => {
    const parts = Array.from({ length: 6 }, (_, i) =>
      p({ osId: `R${i}`, shop: 'A', color: 'red', buffer: i }),
    );
    const result = buildPartCongestion({
      osId: 'SELF',
      steps: [{ shop: 'A', name: '加工' }],
      parts,
      battingLimit: 4,
    });
    expect(result.steps[0].batting).toHaveLength(4);
    expect(result.steps[0].battingRedMore).toBe(2);
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
