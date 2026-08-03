import type { Color, GaicPhase, TimelineCell } from './types';

export const sevRank: Record<Color, number> = { red: 0, yellow: 1, green: 2 };
export const jc = (c: Color) => (c === 'red' ? '赤' : c === 'yellow' ? '黄' : '緑');
export const gaicLabel: Record<string, string> = {
  blue: '順調／クリア済み', yellow: '納期回答待ち・未持出', red: '材料払出待ちで着手不可',
};

/** 外注工程フェーズの表示ラベル */
export const gaicPhaseLabel: Record<GaicPhase, string> = {
  wait_out: '外注-持出待',
  out_done: '外注-持出済',
  wait_in: '外注-納入待',
  in_done: '外注-持込済',
};

/** フェーズバッジの色：「待」=赤、「済」=灰 */
export function gaicPhaseBadgeClass(phase: GaicPhase): string {
  return phase === 'out_done' || phase === 'in_done' ? 'gaic-done' : 'gaic-wait';
}

/** 希望納期・納入予定の補足バッジ文言 */
export function gaicReqBadge(req?: string): { text: string; cls: string } {
  return req ? { text: `希望納期 あり(${req})`, cls: 'gaic-ok' } : { text: '希望納期 なし', cls: 'gaic-ng' };
}

export function gaicEtaBadge(eta?: string): { text: string; cls: string } {
  return eta ? { text: `納入予定 回答あり(${eta})`, cls: 'gaic-ok' } : { text: '納入予定 回答なし', cls: 'gaic-ng' };
}

/** 現在地が外注工程のとき一覧用サマリ */
export function gaicCurrentSummary(cell: TimelineCell): string {
  const parts: string[] = [];
  if (cell.gphase) parts.push(gaicPhaseLabel[cell.gphase]);
  parts.push(gaicReqBadge(cell.greq).text);
  parts.push(gaicEtaBadge(cell.geta).text);
  return parts.join('　');
}
