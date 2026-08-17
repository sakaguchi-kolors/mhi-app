import { describe, expect, it } from 'vitest';
import {
  addWorkdays,
  buildAdjustSupport,
  compressAdjustRows,
  hsToLtDays,
  type AdjustRoutingInput,
} from './adjust.logic';

const d = (s: string): Date => new Date(`${s}T00:00:00`);

const r = (shop: string, hs: number | null, wip = false, job = '0000'): AdjustRoutingInput => ({
  shop,
  job,
  hs,
  wip,
});

describe('hsToLtDays', () => {
  it('8時間を1日とし、0.5日単位に丸める', () => {
    expect(hsToLtDays(56)).toBe(7);
    expect(hsToLtDays(36)).toBe(4.5);
    expect(hsToLtDays(32)).toBe(4);
    expect(hsToLtDays(0.7)).toBe(0);
    expect(hsToLtDays(4)).toBe(0.5);
  });
});

describe('compressAdjustRows', () => {
  it('連続する同一SHOPのHsを合計する', () => {
    const cells = compressAdjustRows([
      r('8209', 20),
      r('8209', 36),
      r('7P32', 16, true),
    ]);
    expect(cells).toEqual([
      { shop: '8209', job: '0000', hsSum: 56, hsKnown: true, wip: false },
      { shop: '7P32', job: '0000', hsSum: 16, hsKnown: true, wip: true },
    ]);
  });

  it('Hsが無い行は合計に入れず、既知フラグも立てない', () => {
    const cells = compressAdjustRows([r('7P21', null, true)]);
    expect(cells[0]).toMatchObject({ hsSum: 0, hsKnown: false });
  });
});

describe('addWorkdays', () => {
  it('休日を飛ばして進める', () => {
    expect(addWorkdays(d('2026-07-07'), 3.5, new Set(['2026-07-08']))).toEqual(d('2026-07-12'));
  });

  it('0日はその日のまま', () => {
    expect(addWorkdays(d('2026-07-07'), 0)).toEqual(d('2026-07-07'));
  });
});

describe('buildAdjustSupport', () => {
  it('参考画像と同じ数字になる（遅延7日・リカバリ3.5日）', () => {
    const result = buildAdjustSupport({
      rows: [
        r('7P21', 8),
        r('8209', 56, true),
        r('7P32', 36),
        r('7P42', 36),
        r('8A99', 32),
      ],
      daysLeft: 16,
      finalDue: d('2026-07-07'),
      shopLt: new Map([
        ['8209', 9],
        ['7P32', 4],
        ['7P42', 6],
        ['8A99', 4],
      ]),
      defaultLt: 4,
      names: [
        { shop: '8209', name: '外注表面処理' },
        { shop: '7P32', name: '受入検査' },
        { shop: '7P42', name: '最終検査' },
        { shop: '8A99', name: '出荷' },
      ],
    });

    expect(result.rows.map((x) => [x.name, x.hsHours, x.hsLtDays, x.expectedLtDays, x.diffDays])).toEqual([
      ['外注表面処理', 56, 7, 9, -2],
      ['受入検査', 36, 4.5, 4, 0.5],
      ['最終検査', 36, 4.5, 6, -1.5],
      ['出荷', 32, 4, 4, 0],
    ]);
    expect(result.delayDays).toBe(7);
    expect(result.recoverableDays).toBe(3.5);
    expect(result.postRecoveryDelayDays).toBe(3.5);
    expect(result.postRecoveryDate).toBe('07/11');
    expect(result.finalDue).toBe('07/07');
  });

  it('完了済みなら残工程なし・遅延0', () => {
    const result = buildAdjustSupport({
      rows: [r('7P21', 8), r('8A99', 4)],
      daysLeft: 10,
      finalDue: d('2026-07-20'),
      shopLt: new Map(),
      defaultLt: 4,
    });
    expect(result.rows).toEqual([]);
    expect(result.delayDays).toBe(0);
    expect(result.recoverableDays).toBe(0);
    expect(result.postRecoveryDelayDays).toBe(0);
    expect(result.postRecoveryDate).toBe('07/20');
  });

  it('Hs不明の工程は差分0（リカバリに入れない）', () => {
    const result = buildAdjustSupport({
      rows: [r('7P21', null, true), r('8A99', 8)],
      daysLeft: 4,
      finalDue: d('2026-07-10'),
      shopLt: new Map(),
      defaultLt: 4,
    });
    expect(result.rows[0].hsHours).toBeNull();
    expect(result.rows[0].hsLtDays).toBeNull();
    expect(result.rows[0].diffDays).toBe(0);
    expect(result.delayDays).toBe(4);
    expect(result.recoverableDays).toBe(3);
  });
});
