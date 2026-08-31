import { describe, expect, it } from 'vitest';
import { classifyPartByRegex } from '../shared/domain';
import {
  DEFAULT_KISHU_DUE_PRIORITY,
  resolveFinalDueForPart,
  type DueCandidates,
} from '../etl/etl-compute.util';
import { computePart, type CalcOptions, type PartMeta } from './calc';
import type { Color, Part } from '../common/types';
import type { RoutingRow } from '../etl/etl-routing.types';

/**
 * 部品1個を固定し、基準日(asOf)とマスタだけを動かしたときの指標変化。
 *
 * 工程（4 Shop）:
 *   [0] 8A21 旋削加工          done
 *   [1] 8209 外注コーティング   current（着手 2026-06-28 / 持出済）
 *   [2] 7P32 検査（処理）       wait  … ヒューリスティック上のマイルストン
 *   [3] 8A99 最終加工           wait
 *
 * 既定マスタ:
 *   SHOP_LT_DAYS=4 / MILESTONE_LT_DAYS=5 / STAGNANT_THRESHOLD=10
 *   BUFFER_GREEN=1 / BUFFER_YELLOW=0 / 休日なし
 *
 * 最終納期 2026-07-22、残Shop=3 → 所要 12日。
 * asOf=2026-07-08 なら残日数14、バッファ +2（緑）、滞留10日（閾値ちょうど）。
 */
const d = (s: string) => new Date(`${s}T00:00:00`);

const NAMES: Record<string, string> = {
  '8A21': '旋削加工',
  '8209': '外注コーティング',
  '7P32': '検査（処理）',
  '8A99': '最終加工',
};
const resolveName = (shop: string) => NAMES[shop] ?? `Shop ${shop}`;

const OS_ID = 'X000000001';
const PART_NO = '37B90000-001';
const FINAL_DUE = '2026-07-22';
const PLAN_START_CURRENT = '2026-06-28';

const DEFAULT_OPTS: CalcOptions = {
  shopLtDays: 4,
  milestoneLtDays: 5,
  stagnantThreshold: 10,
  bufGreen: 1,
  bufYellow: 0,
};

function row(seq: number, shop: string, extra: Partial<RoutingRow> = {}): RoutingRow {
  return {
    osId: OS_ID,
    seqMain: seq,
    seqSub: 0,
    seqLabel: String(seq),
    shop,
    job: '0000',
    planStart: d('2026-01-01'),
    planEnd: d('2026-06-01'),
    actualEnd: null,
    hs: null,
    wip: false,
    materialStatus: '4_材料払出済',
    outDate: null,
    inDate: null,
    etaDate: null,
    reqDueDate: null,
    orderNo: '',
    ...extra,
  };
}

const ROWS: RoutingRow[] = [
  row(10, '8A21'),
  row(20, '8209', {
    wip: true,
    job: '0001',
    planStart: d(PLAN_START_CURRENT),
    outDate: d('2026-06-30'),
    orderNo: 'W12TEST01',
  }),
  row(30, '7P32'),
  row(40, '8A99'),
];

const META: PartMeta = {
  osId: OS_ID,
  partNo: PART_NO,
  name: 'FITTING-TEST',
  category: '機構部品',
  kishu: '37B',
  finalDue: d(FINAL_DUE),
  urgent: false,
  shortage: false,
};

function run(asOf: string, opts: Partial<CalcOptions> = {}, meta: Partial<PartMeta> = {}): Part {
  return computePart({ ...META, ...meta }, ROWS, resolveName, d(asOf), { ...DEFAULT_OPTS, ...opts });
}

interface Indicators {
  daysLeft: number;
  buffer: number;
  color: Color;
  stagnant: number;
  stagnantFlag: boolean;
  remainShops: number;
  currentShop: string;
  msDue: string | undefined;
  msColor: Color | undefined;
  gstat: Part['timeline'][number]['gstat'];
  gphase: Part['timeline'][number]['gphase'];
}

function indicators(part: Part, threshold = DEFAULT_OPTS.stagnantThreshold): Indicators {
  const ms = part.timeline.find((c) => c.milestone && !c.mpassed);
  const gaic = part.timeline.find((c) => c.gaic);
  return {
    daysLeft: part.daysLeft,
    buffer: part.buffer,
    color: part.color,
    stagnant: part.stagnant,
    stagnantFlag: part.stagnant >= threshold,
    remainShops: part.remainShops,
    currentShop: part.currentShop,
    msDue: ms?.mdue,
    msColor: ms?.mcolor,
    gstat: gaic?.gstat,
    gphase: gaic?.gphase,
  };
}

describe('部品1個 × マスタ：当日の指標変化', () => {
  it('基準日 2026-07-08 の固定値（以降の差分の起点）', () => {
    const part = run('2026-07-08');
    expect(part.totalShops).toBe(4);
    expect(part.doneShops).toBe(1);
    expect(indicators(part)).toEqual({
      daysLeft: 14,
      buffer: 2,
      color: 'green',
      stagnant: 10,
      stagnantFlag: true,
      remainShops: 3,
      currentShop: '外注コーティング',
      msDue: '07/17',
      msColor: 'green',
      gstat: 'yellow',
      gphase: 'out_done',
    });
    expect(part.timeline[1].gout).toBe('06/30');
    expect(part.timeline[2]).toMatchObject({ shop: '7P32', milestone: true, status: 'wait' });
  });

  it.each([
    // asOf が進むと残日数・バッファ・色・滞留・マイルストン色がこう変わる
    {
      asOf: '2026-07-07',
      daysLeft: 15,
      buffer: 3,
      color: 'green' as const,
      stagnant: 9,
      stagnantFlag: false,
      msDue: '07/17',
      msColor: 'green' as const,
    },
    {
      asOf: '2026-07-08',
      daysLeft: 14,
      buffer: 2,
      color: 'green' as const,
      stagnant: 10,
      stagnantFlag: true,
      msDue: '07/17',
      msColor: 'green' as const,
    },
    {
      asOf: '2026-07-09',
      daysLeft: 13,
      buffer: 1,
      color: 'green' as const,
      stagnant: 11,
      stagnantFlag: true,
      msDue: '07/17',
      msColor: 'yellow' as const,
    },
    {
      asOf: '2026-07-10',
      daysLeft: 12,
      buffer: 0,
      color: 'yellow' as const,
      stagnant: 12,
      stagnantFlag: true,
      msDue: '07/17',
      msColor: 'red' as const,
    },
    {
      asOf: '2026-07-11',
      daysLeft: 11,
      buffer: -1,
      color: 'red' as const,
      stagnant: 13,
      stagnantFlag: true,
      msDue: '07/17',
      msColor: 'red' as const,
    },
    {
      asOf: '2026-07-22',
      daysLeft: 0,
      buffer: -12,
      color: 'red' as const,
      stagnant: 24,
      stagnantFlag: true,
      msDue: '07/17',
      msColor: 'red' as const,
    },
    {
      asOf: '2026-07-23',
      daysLeft: -1,
      buffer: -13,
      color: 'red' as const,
      stagnant: 25,
      stagnantFlag: true,
      msDue: '07/17',
      msColor: 'red' as const,
    },
  ])(
    'asOf=$asOf → 残$daysLeft / バッファ$buffer($color) / 滞留$stagnant / 検査マイルストン$msDue($msColor)',
    (row) => {
      const got = indicators(run(row.asOf));
      expect(got).toMatchObject({
        daysLeft: row.daysLeft,
        buffer: row.buffer,
        color: row.color,
        stagnant: row.stagnant,
        stagnantFlag: row.stagnantFlag,
        remainShops: 3,
        currentShop: '外注コーティング',
        msDue: row.msDue,
        msColor: row.msColor,
        gstat: 'yellow',
        gphase: 'out_done',
      });
    },
  );
});

describe('部品1個 × マスタ変更：指標がこう変わればOK', () => {
  const asOf = '2026-07-08';

  it.each([
    {
      name: 'SHOP_LT_DAYS 4→2（所要が半分）',
      opts: { shopLtDays: 2 },
      want: { daysLeft: 14, buffer: 8, color: 'green' as const, msDue: '07/17', msColor: 'green' as const },
    },
    {
      name: 'SHOP_LT_DAYS 4→6（所要が増えて赤）',
      opts: { shopLtDays: 6 },
      want: { daysLeft: 14, buffer: -4, color: 'red' as const, msDue: '07/17', msColor: 'red' as const },
    },
    {
      name: 'm_shop_lt で現行Shop 8209 だけ LT=10',
      opts: { shopLt: new Map([['8209', 10]]) },
      want: { daysLeft: 14, buffer: -4, color: 'red' as const, msDue: '07/17', msColor: 'red' as const },
    },
    {
      name: 'BUFFER_GREEN=3（バッファ+2 でも黄）',
      opts: { bufGreen: 3, bufYellow: 0 },
      want: { daysLeft: 14, buffer: 2, color: 'yellow' as const, msDue: '07/17', msColor: 'yellow' as const },
    },
    {
      name: 'MILESTONE_LT_DAYS 5→10（検査期日が 07/17→07/12、色は赤）',
      opts: { milestoneLtDays: 10 },
      want: { daysLeft: 14, buffer: 2, color: 'green' as const, msDue: '07/12', msColor: 'red' as const },
    },
    {
      name: 'm_calendar 休日 07/09,07/10（残日数から除外→バッファ0で黄）',
      opts: { holidays: new Set(['2026-07-09', '2026-07-10']) },
      want: { daysLeft: 12, buffer: 0, color: 'yellow' as const, msDue: '07/17', msColor: 'red' as const },
    },
  ])('$name', ({ opts, want }) => {
    const got = indicators(run(asOf, opts));
    expect(got).toMatchObject({
      ...want,
      remainShops: 3,
      currentShop: '外注コーティング',
      stagnant: 10,
      stagnantFlag: true,
    });
  });

  it('m_calendar 休日 07/01（着手〜当日の間）→ 滞留だけ 10→9 でフラグが消える', () => {
    const got = indicators(run(asOf, { holidays: new Set(['2026-07-01']) }));
    expect(got).toMatchObject({
      daysLeft: 14,
      buffer: 2,
      color: 'green',
      stagnant: 9,
      stagnantFlag: false,
      msDue: '07/17',
      msColor: 'green',
    });
  });

  it('STAGNANT_THRESHOLD 10→11 → 滞留日数は10のまま、フラグだけ消える', () => {
    const part = run(asOf);
    expect(part.stagnant).toBe(10);
    expect(indicators(part, 10).stagnantFlag).toBe(true);
    expect(indicators(part, 11).stagnantFlag).toBe(false);
  });

  it('m_milestone マーク空 → 検査ヒューリスティックが効かずマイルストン指標なし', () => {
    const got = indicators(run(asOf, { milestoneMarks: new Set() }));
    expect(got.msDue).toBeUndefined();
    expect(got.msColor).toBeUndefined();
    expect(run(asOf, { milestoneMarks: new Set() }).timeline.every((c) => !c.milestone)).toBe(true);
  });

  it('m_milestone で 8A99 も◎ → 未到達マイルストンの期日は最終工程 07/22', () => {
    const part = run(asOf, { milestoneMarks: new Set(['7P32::0000', '8A99::0000']) });
    const pending = part.timeline.filter((c) => c.milestone && !c.mpassed);
    expect(pending.map((c) => ({ shop: c.shop, mdue: c.mdue, mcolor: c.mcolor }))).toEqual([
      { shop: '7P32', mdue: '07/17', mcolor: 'green' },
      { shop: '8A99', mdue: '07/22', mcolor: 'green' },
    ]);
  });

  it('m_milestone 外注マークのみ（実績なし）→ 旋削が外注黄・持出待になる', () => {
    const part = run(asOf, { gaicMarks: new Set(['8A21::0000']) });
    expect(part.timeline[0]).toMatchObject({ shop: '8A21', gaic: true, gstat: 'yellow', gphase: 'wait_out' });
    expect(part.timeline[1]).toMatchObject({ shop: '8209', gaic: true, gstat: 'yellow', gphase: 'out_done' });
  });

  it('m_category: 部品番号 37B… は機構部品、未一致は「その他」', () => {
    const rules = [
      { re: /^V/, category: '推進系ユニット' },
      { re: /^37B/, category: '機構部品' },
    ];
    expect(classifyPartByRegex(PART_NO, rules)).toBe('機構部品');
    expect(classifyPartByRegex('XX-999', rules)).toBe('その他');
  });

  it('機種別納期優先で最終納期が 07/22→07/08 になると、当日の色が緑→赤', () => {
    const candidates: DueCandidates = {
      pbs: d('2026-07-22'),
      flexsche: d('2026-07-08'),
      octopus: d('2026-08-01'),
    };
    const pbsDue = resolveFinalDueForPart('37B', candidates, new Map(), DEFAULT_KISHU_DUE_PRIORITY);
    const flexDue = resolveFinalDueForPart(
      '37B',
      candidates,
      new Map([['37B', ['flexsche', 'pbs', 'octopus']]]),
      DEFAULT_KISHU_DUE_PRIORITY,
    );

    const byPbs = indicators(run(asOf, {}, { finalDue: pbsDue }));
    const byFlex = indicators(run(asOf, {}, { finalDue: flexDue }));

    expect(byPbs).toMatchObject({ daysLeft: 14, buffer: 2, color: 'green' });
    expect(byFlex).toMatchObject({ daysLeft: 0, buffer: -12, color: 'red', msDue: '07/03', msColor: 'red' });
  });
});
