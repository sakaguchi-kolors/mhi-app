import { describe, expect, it } from 'vitest';
import { barShares, levelLabel } from './congestion.view';

describe('barShares', () => {
  it('内訳を割合にする', () => {
    expect(barShares({ red: 13, yellow: 12, green: 11, started: 36 })).toEqual({
      red: (13 / 36) * 100,
      yellow: (12 / 36) * 100,
      green: (11 / 36) * 100,
    });
  });

  it('0件でも割れない', () => {
    expect(barShares({ red: 0, yellow: 0, green: 0, started: 0 })).toEqual({ red: 0, yellow: 0, green: 0 });
  });
});

describe('levelLabel', () => {
  it('凡例文言を閾値から作る', () => {
    const t = { yellow: 30, red: 50 };
    expect(levelLabel('red', t)).toBe('着手予定数 50件以上');
    expect(levelLabel('yellow', t)).toBe('着手予定数 30〜49件');
    expect(levelLabel('green', t)).toBe('着手予定数 30件未満');
  });
});
