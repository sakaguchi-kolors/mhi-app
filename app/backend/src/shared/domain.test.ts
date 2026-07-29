import { describe, expect, it } from 'vitest';
import {
  bufferColor,
  classifyPartByRegex,
  classifyPartByRows,
  colorCounts,
  matchMilestone,
} from './domain';

describe('bufferColor', () => {
  it('uses default thresholds', () => {
    expect(bufferColor(1)).toBe('green');
    expect(bufferColor(0)).toBe('yellow');
    expect(bufferColor(-1)).toBe('red');
  });

  it('supports custom thresholds', () => {
    expect(bufferColor(2, 2, 1)).toBe('green');
    expect(bufferColor(1, 2, 1)).toBe('yellow');
    expect(bufferColor(0, 2, 1)).toBe('red');
  });
});

describe('matchMilestone', () => {
  it('matches by rule type', () => {
    expect(matchMilestone('shop', '7P31', '7P31', '任意')).toBe(true);
    expect(matchMilestone('name_contains', '検査', '8A99', '最終検査')).toBe(true);
    expect(matchMilestone('shop_prefix', '7P3', '7P31', '任意')).toBe(true);
    expect(matchMilestone('shop', '7P31', '8A21', '旋削')).toBe(false);
  });
});

describe('classifyPartByRegex', () => {
  it('returns first matching category by priority order in rules array', () => {
    const rules = [{ re: /^V/, category: 'V系' }, { re: /^V1/, category: 'V1系' }];
    expect(classifyPartByRegex('V123', rules)).toBe('V系');
    expect(classifyPartByRegex('X999', rules)).toBe('その他');
  });
});

describe('classifyPartByRows', () => {
  it('respects priority and active flag', () => {
    const rows = [
      { pattern: '^V', category: 'V系', priority: 10, active: true },
      { pattern: '^V1', category: 'V1系', priority: 1, active: true },
      { pattern: '^X', category: '無効', priority: 0, active: false },
    ];
    expect(classifyPartByRows('V123', rows)).toBe('V1系');
    expect(classifyPartByRows('X123', rows)).toBe('その他');
  });
});

describe('colorCounts', () => {
  it('counts parts by color', () => {
    const parts = [
      { buffer: 1, color: 'green' as const },
      { buffer: 0, color: 'yellow' as const },
      { buffer: -1, color: 'red' as const },
    ];
    expect(colorCounts(parts)).toEqual({ green: 1, yellow: 1, red: 1 });
  });
});
