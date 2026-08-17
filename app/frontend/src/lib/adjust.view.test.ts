import { describe, expect, it } from 'vitest';
import type { AdjustSupport } from '../types';
import { delayTone, diffTone, formatDays, formatHs, postRecoverySub, signedDiff } from './adjust.view';

const data = (o: Partial<AdjustSupport> = {}): AdjustSupport => ({
  delayDays: 7,
  recoverableDays: 3.5,
  postRecoveryDelayDays: 3.5,
  postRecoveryDate: '07/10',
  finalDue: '07/07',
  hoursPerDay: 8,
  rows: [],
  ...o,
});

describe('adjust.view', () => {
  it('日数とHsを表示用に整える', () => {
    expect(formatDays(3.5)).toBe('3.5日');
    expect(formatHs(56)).toBe('56h');
    expect(formatHs(null)).toBe('—');
  });

  it('差分は符号つき、0は符号なし', () => {
    expect(signedDiff(-2)).toBe('-2日');
    expect(signedDiff(0.5)).toBe('+0.5日');
    expect(signedDiff(0)).toBe('0日');
  });

  it('色分けの向きを返す', () => {
    expect(diffTone(-2)).toBe('gain');
    expect(diffTone(0.5)).toBe('loss');
    expect(diffTone(0)).toBe('flat');
    expect(delayTone(7)).toBe('late');
    expect(delayTone(0)).toBe('ok');
  });

  it('リカバリ後の補足文', () => {
    expect(postRecoverySub(data({ postRecoveryDelayDays: 3.5 }))).toBe('最終納期 +3.5日');
    expect(postRecoverySub(data({ postRecoveryDelayDays: 0 }))).toBe('最終納期どおり');
    expect(postRecoverySub(data({ postRecoveryDelayDays: -1 }))).toBe('最終納期 -1日');
  });
});
