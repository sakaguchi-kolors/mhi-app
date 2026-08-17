import type { Color, CongestionLevel, PartCongestion } from '../types';

export const COLOR_LABEL: Record<Color, string> = { red: '赤', yellow: '黄', green: '緑' };

export function barShares(step: { red: number; yellow: number; green: number; started: number }): {
  red: number;
  yellow: number;
  green: number;
} {
  if (step.started <= 0) return { red: 0, yellow: 0, green: 0 };
  return {
    red: (step.red / step.started) * 100,
    yellow: (step.yellow / step.started) * 100,
    green: (step.green / step.started) * 100,
  };
}

export function levelLabel(level: CongestionLevel, t: PartCongestion['thresholds']): string {
  if (level === 'red') return `着手予定数 ${t.red}件以上`;
  if (level === 'yellow') return `着手予定数 ${t.yellow}〜${t.red - 1}件`;
  return `着手予定数 ${t.yellow}件未満`;
}
