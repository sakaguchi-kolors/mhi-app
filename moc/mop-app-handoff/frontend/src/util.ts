import type { Color } from './types';

export const sevRank: Record<Color, number> = { red: 0, yellow: 1, green: 2 };
export const jc = (c: Color) => (c === 'red' ? '赤' : c === 'yellow' ? '黄' : '緑');
export const gaicLabel: Record<string, string> = {
  blue: '順調／クリア済み', yellow: '納期回答待ち・未持出', red: '材料払出待ちで着手不可',
};
