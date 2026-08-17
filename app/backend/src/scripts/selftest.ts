// 算出ロジックの自己検証（DB不要 / Nodeのみで実行可）。
// モック v13 の部品 X000677148(FITTING) を工程から再現し、期待値と照合する。
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
} from '../calc/calc';
import type { RoutingRow } from '../etl/etl-routing.types';

let failures = 0;
function eq(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(got)}${ok ? '' : ` want=${JSON.stringify(want)}`}`);
  if (!ok) failures++;
}

// --- 単体：色境界（2.3） ---
eq('color buffer=1', bufferColor(1), 'green');
eq('color buffer=0', bufferColor(0), 'yellow');
eq('color buffer=-1', bufferColor(-1), 'red');
// --- 単体：マイルストン判定（2.4） ---
eq('milestone 検査名', isMilestone('8A99', '検査（素材確認）'), true);
eq('milestone 7P31', isMilestone('7P31', '不働態化処理'), true);
eq('milestone 通常', isMilestone('8A21', 'ＮＣ旋削加工'), false);
// --- 単体：外注ステータス（2.6, 上から評価） ---
eq('gaic 戻り済=blue', gaicStatus(true, 'x', true, false), 'blue');
eq('gaic 未払出=red', gaicStatus(false, '3_未払出', true, true), 'red');
eq('gaic 回答待ち=yellow', gaicStatus(false, '4_材料払出済', true, false), 'yellow');
eq('gaic 順調=blue', gaicStatus(false, '4_材料払出済', true, true), 'blue');
eq('gaicPhase 持出待', gaicPhase(false, '3_未払出', false, false), 'wait_out');
eq('gaicPhase 持出済', gaicPhase(false, '4_材料払出済', true, false), 'out_done');
eq('gaicPhase 納入待', gaicPhase(false, '4_材料払出済', true, true), 'wait_in');
eq('gaicPhase 持込済', gaicPhase(true, '4_材料払出済', true, true), 'in_done');
// --- 単体：日付ユーティリティ ---
const d0 = (s: string) => new Date(s + 'T00:00:00');
eq('diffDays 同じ日', diffDays(d0('2026-07-08'), d0('2026-07-08')), 0);
eq('diffDays +2日', diffDays(d0('2026-07-10'), d0('2026-07-08')), 2);
eq('mmdd 7/8', mmdd(d0('2026-07-08')), '07/08');
eq('mmdd null', mmdd(null), undefined);
eq('ymd 2026/07/08', ymd(d0('2026-07-08')), '2026/07/08');
eq('ymd null', ymd(null), '');
// --- 単体：稼働日計算（休日除外） ---
const holidays = new Set(['2026-07-09']);
eq('dayDiff 休日1日', dayDiff(d0('2026-07-10'), d0('2026-07-08'), holidays), 1);
eq('dayDiff 休日なし', dayDiff(d0('2026-07-10'), d0('2026-07-08')), 2);
// --- 単体：マイルストン判定（shop::job マーク） ---
const marks = new Set(['7P31::J1', '8A99::J2']);
eq('milestone mark hit', isMilestone('7P31', '任意', marks, 'J1'), true);
eq('milestone mark miss shop', isMilestone('8A21', '旋削', marks, 'J1'), false);
eq('milestone mark miss job', isMilestone('7P31', '任意', marks, 'J9'), false);
// --- 単体：色境界（カスタム閾値） ---
eq('color custom green=2', bufferColor(2, 2, 1), 'green');
eq('color custom yellow=1', bufferColor(1, 2, 1), 'yellow');
eq('color custom red=0', bufferColor(0, 2, 1), 'red');

// --- 結合：1部品分の算出 ---
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
  hs: null,
  wip,
  materialStatus: '4_材料払出済',
  outDate: null,
  inDate: null,
  etaDate: null,
  reqDueDate: null,
  orderNo: '',
  ...extra,
});
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
const part = computePart(meta, rows, resolve, asOf, { shopLtDays: 4, milestoneLtDays: 5, stagnantThreshold: 10 });

eq('totalShops', part.totalShops, 7);
eq('doneShops', part.doneShops, 4);
eq('remainShops', part.remainShops, 3);
eq('daysLeft', part.daysLeft, 2);
eq('buffer', part.buffer, -10);
eq('color', part.color, 'red');
eq('currentShop', part.currentShop, '不働態化処理');
eq('gaic[1].gstat=blue', part.timeline[1].gstat, 'blue');
eq('ms[5].mdue', part.timeline[5].mdue, '07/05');
eq('ms[5].mcolor', part.timeline[5].mcolor, 'red');
eq('ms[6].mdue', part.timeline[6].mdue, '07/10');
eq('ms[6].mcolor', part.timeline[6].mcolor, 'red');
eq('ms[0].passed', part.timeline[0].mpassed, true);

console.log(failures === 0 ? '\n✅ 全テストPASS' : `\n❌ ${failures}件FAIL`);
process.exit(failures === 0 ? 0 : 1);
