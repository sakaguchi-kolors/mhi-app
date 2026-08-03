import { describe, expect, it } from 'vitest';
import { applyMilestoneRules, milestoneRowKey, parseMilestoneRowKey } from './milestone-mark.util';

describe('milestone-mark.util', () => {
  it('applyMilestoneRules matches name and shop rules', () => {
    const rows = [
      { shop: '7P31', job: '001', name: '検査（浸透）' },
      { shop: '8A21', job: '002', name: 'NC旋削' },
      { shop: '7P42', job: '003', name: 'バランス' },
    ];
    const marks = applyMilestoneRules(rows, [
      { match_type: 'name_contains', pattern: '検査' },
      { match_type: 'shop', pattern: '7P42' },
    ]);
    expect(marks).toEqual([
      { shop: '7P31', job: '001', isMilestone: true, gaic: false },
      { shop: '7P42', job: '003', isMilestone: true, gaic: false },
    ]);
  });

  it('milestoneRowKey roundtrip', () => {
    const key = milestoneRowKey('7P31', '001');
    expect(key).toBe('7P31::001');
    expect(parseMilestoneRowKey(key)).toEqual({ shop: '7P31', job: '001' });
  });
});
