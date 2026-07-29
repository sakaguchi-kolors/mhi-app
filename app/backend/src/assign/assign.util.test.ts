import { describe, expect, it } from 'vitest';
import { buildKishuUsers, initAssignLoad, planAutoAssign } from './assign.util';

describe('assign.util', () => {
  it('buildKishuUsers groups by kishu', () => {
    const map = buildKishuUsers(
      [
        { userId: 1, displayName: 'A' },
        { userId: 2, displayName: 'B' },
      ],
      [
        { userId: 1, kishu: 'X' },
        { userId: 2, kishu: 'X' },
        { userId: 1, kishu: 'Y' },
      ],
    );
    expect(map.get('X')?.map((u) => u.name)).toEqual(['A', 'B']);
    expect(map.get('Y')?.length).toBe(1);
  });

  it('planAutoAssign balances load across candidates', () => {
    const kishuUsers = new Map([
      ['K1', [
        { userId: 1, name: 'A' },
        { userId: 2, name: 'B' },
      ]],
    ]);
    const kishuOf = new Map([
      ['p1', 'K1'],
      ['p2', 'K1'],
      ['p3', 'K1'],
      ['p4', 'K1'],
    ]);
    const load = initAssignLoad([], kishuUsers);
    const { assignMap, leftover, byOwner } = planAutoAssign(['p1', 'p2', 'p3', 'p4'], kishuOf, kishuUsers, load);

    expect(leftover).toBe(0);
    expect(assignMap.size).toBe(4);
    expect(byOwner.find((b) => b.owner === 'A')?.count).toBe(2);
    expect(byOwner.find((b) => b.owner === 'B')?.count).toBe(2);
  });

  it('planAutoAssign prefers less loaded when existing assignments exist', () => {
    const kishuUsers = new Map([['K1', [{ userId: 1, name: 'A' }, { userId: 2, name: 'B' }]]]);
    const load = initAssignLoad([{ userId: 1, count: 2 }], kishuUsers);
    const { assignMap } = planAutoAssign(['p1'], new Map([['p1', 'K1']]), kishuUsers, load);
    expect(assignMap.get('p1')?.name).toBe('B');
  });

  it('planAutoAssign counts leftover when no candidate', () => {
    const { leftover, assignMap } = planAutoAssign(['p1'], new Map([['p1', 'UNKNOWN']]), new Map(), new Map());
    expect(leftover).toBe(1);
    expect(assignMap.size).toBe(0);
  });
});
