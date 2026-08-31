import { describe, expect, it } from 'vitest';
import {
  computePart,
  bufferColor,
  isMilestone,
  gaicStatus,
  gaicPhase,
  dayDiff,
  diffDays,
  mmdd,
  ymd,
  type PartMeta,
} from './calc';
import type { RoutingRow } from '../etl/etl-routing.types';

describe('calc helpers', () => {
  const d0 = (s: string) => new Date(s + 'T00:00:00');

  it('bufferColor boundaries', () => {
    expect(bufferColor(1)).toBe('green');
    expect(bufferColor(0)).toBe('yellow');
    expect(bufferColor(-1)).toBe('red');
  });

  it('isMilestone heuristic', () => {
    expect(isMilestone('8A99', '検査（素材確認）')).toBe(true);
    expect(isMilestone('7P31', '不働態化処理')).toBe(true);
    expect(isMilestone('8A21', 'ＮＣ旋削加工')).toBe(false);
  });

  it('gaicStatus evaluation order', () => {
    expect(gaicStatus(true, 'x', true, false)).toBe('blue');
    expect(gaicStatus(false, '3_未払出', true, true)).toBe('red');
    expect(gaicStatus(false, '4_材料払出済', true, false)).toBe('yellow');
    expect(gaicStatus(false, '4_材料払出済', true, true)).toBe('blue');
  });

  it('gaicPhase progression', () => {
    expect(gaicPhase(true, '4_材料払出済', true, true)).toBe('in_done');
    expect(gaicPhase(false, '3_未払出', false, false)).toBe('wait_out');
    expect(gaicPhase(false, '4_材料払出済', true, false)).toBe('out_done');
    expect(gaicPhase(false, '4_材料払出済', true, true)).toBe('wait_in');
  });

  it('date utilities', () => {
    expect(diffDays(d0('2026-07-08'), d0('2026-07-08'))).toBe(0);
    expect(diffDays(d0('2026-07-10'), d0('2026-07-08'))).toBe(2);
    expect(mmdd(d0('2026-07-08'))).toBe('07/08');
    expect(mmdd(null)).toBeUndefined();
    expect(ymd(d0('2026-07-08'))).toBe('2026/07/08');
    expect(ymd(null)).toBe('');
    expect(dayDiff(d0('2026-07-10'), d0('2026-07-08'), new Set(['2026-07-09']))).toBe(1);
  });
});

describe('computePart integration', () => {
  const asOf = new Date('2026-07-08T00:00:00');
  const d = (s: string) => new Date(s + 'T00:00:00');
  const names: Record<string, string> = {
    '7P21': '検査（素材確認）',
    '8209': 'サーメテルWコ－ティング',
    '7P31': '検査（浸透探傷）',
    '8A61': '不働態化処理',
    '7P32': '検査（処理）',
  };
  const resolve = (shop: string) => names[shop] ?? `Shop ${shop}`;

  const R = (i: number, shop: string, wip = false, extra: Partial<RoutingRow> = {}): RoutingRow => ({
    osId: 'X000677148',
    seqMain: i,
    seqSub: 0,
    seqLabel: String(i),
    shop,
    job: '0000',
    planStart: d('2026-01-01'),
    planEnd: d('2026-06-01'),
    actualEnd: null,
    wip,
    materialStatus: '4_材料払出済',
    outDate: null,
    inDate: null,
    etaDate: null,
    reqDueDate: null,
    orderNo: '',
    ...extra,
  });

  it('computes mock v13 part X000677148', () => {
    const rows: RoutingRow[] = [
      R(10, '7P21'),
      R(20, '8209', false, { outDate: d('2026-02-01'), inDate: d('2026-02-20'), orderNo: 'W12GDD44' }),
      R(30, '7P21'),
      R(40, '7P31'),
      R(50, '8A61', true, { planStart: d('2026-03-03') }),
      R(60, '7P32'),
      R(70, '7P31'),
    ];
    const meta: PartMeta = {
      osId: 'X000677148',
      partNo: '37B93029-003',
      name: 'FITTING',
      category: '機構部品',
      kishu: '37B',
      finalDue: d('2026-07-10'),
      urgent: false,
      shortage: false,
    };
    const part = computePart(meta, rows, resolve, asOf, {
      shopLtDays: 4,
      milestoneLtDays: 5,
      stagnantThreshold: 10,
    });

    expect(part.totalShops).toBe(7);
    expect(part.doneShops).toBe(4);
    expect(part.remainShops).toBe(3);
    expect(part.daysLeft).toBe(2);
    expect(part.buffer).toBe(-10);
    expect(part.color).toBe('red');
    expect(part.currentShop).toBe('不働態化処理');
    expect(part.timeline[1].gstat).toBe('blue');
    expect(part.timeline[1].gphase).toBe('in_done');
    expect(part.timeline[1].gout).toBe('02/01');
    expect(part.timeline[1].gin).toBe('02/20');
    expect(part.timeline[5].mdue).toBe('07/05');
    expect(part.timeline[5].mcolor).toBe('red');
    expect(part.timeline[0].mpassed).toBe(true);
  });
});
