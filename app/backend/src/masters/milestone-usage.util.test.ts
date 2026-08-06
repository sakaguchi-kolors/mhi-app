import { describe, expect, it } from 'vitest';
import { computeMilestoneUsageStats } from './milestone-usage.util';

describe('computeMilestoneUsageStats', () => {
  it('marks in use when JND(実績) is empty and JND(計算) exists', () => {
    const stats = computeMilestoneUsageStats([
      { shop: '8622', job: '1010', planEnd: new Date('2026-07-01'), actualEnd: null },
    ]);
    expect(stats.get('8622::1010')).toEqual({ inUse: true, lastUsedAt: null });
  });

  it('uses latest actual end as last used when not in use', () => {
    const stats = computeMilestoneUsageStats([
      { shop: '8621', job: '1090', planEnd: new Date('2026-07-01'), actualEnd: new Date('2024-07-01') },
      { shop: '8621', job: '1090', planEnd: new Date('2026-08-01'), actualEnd: new Date('2025-01-15') },
    ]);
    expect(stats.get('8621::1090')).toEqual({ inUse: false, lastUsedAt: new Date('2025-01-15') });
  });

  it('stays in use if any routing row is active', () => {
    const stats = computeMilestoneUsageStats([
      { shop: '7P42', job: '0002', planEnd: new Date('2026-07-01'), actualEnd: new Date('2025-01-01') },
      { shop: '7P42', job: '0002', planEnd: new Date('2026-08-01'), actualEnd: null },
    ]);
    expect(stats.get('7P42::0002')?.inUse).toBe(true);
    expect(stats.get('7P42::0002')?.lastUsedAt).toBeNull();
  });

  it('treats missing plan and actual as not in use', () => {
    const stats = computeMilestoneUsageStats([
      { shop: '8621', job: '0000', planEnd: null, actualEnd: null },
    ]);
    expect(stats.get('8621::0000')).toEqual({ inUse: false, lastUsedAt: null });
  });
});
