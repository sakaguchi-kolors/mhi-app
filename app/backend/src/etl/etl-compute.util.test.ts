import { describe, expect, it } from 'vitest';
import {
  aggregateColorCounts,
  DEFAULT_KISHU_DUE_PRIORITY,
  isDefaultKishuDuePriority,
  parseDefaultKishuDuePriority,
  resolveFinalDueForPart,
} from './etl-compute.util';

describe('aggregateColorCounts', () => {
  it('counts colors', () => {
    expect(aggregateColorCounts(['green', 'yellow', 'red', 'green', null])).toEqual({
      green: 3,
      yellow: 1,
      red: 1,
    });
  });
});

describe('resolveFinalDueForPart', () => {
  const candidates = {
    flexsche: new Date('2026-04-01'),
    octopus: new Date('2026-05-01'),
    pbs: new Date('2026-03-01'),
  };

  it('uses default PBS-first priority when kishu is not configured', () => {
    expect(resolveFinalDueForPart('K1', candidates, new Map(), DEFAULT_KISHU_DUE_PRIORITY)).toEqual(candidates.pbs);
  });

  it('uses configured priority order', () => {
    const map = new Map<string, ['octopus', 'pbs', 'flexsche']>([['K1', ['octopus', 'pbs', 'flexsche']]]);
    expect(resolveFinalDueForPart('K1', candidates, map, DEFAULT_KISHU_DUE_PRIORITY)).toEqual(candidates.octopus);
  });

  it('uses param-based default when kishu is not configured', () => {
    const defaultPriority = parseDefaultKishuDuePriority(
      new Map([
        ['KISHU_DUE_PRIORITY_1', 'flexsche'],
        ['KISHU_DUE_PRIORITY_2', 'pbs'],
        ['KISHU_DUE_PRIORITY_3', 'octopus'],
      ]),
    );
    expect(resolveFinalDueForPart('K1', candidates, new Map(), defaultPriority)).toEqual(candidates.flexsche);
  });
});

describe('isDefaultKishuDuePriority', () => {
  it('detects standard order', () => {
    expect(isDefaultKishuDuePriority(DEFAULT_KISHU_DUE_PRIORITY)).toBe(true);
    expect(isDefaultKishuDuePriority(['flexsche', 'pbs', 'octopus'])).toBe(false);
  });
});
