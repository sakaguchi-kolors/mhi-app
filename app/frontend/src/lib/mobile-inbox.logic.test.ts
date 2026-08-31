import { describe, expect, it } from 'vitest';
import {
  buildInbox,
  compareInboxPriority,
  countInboxTabs,
  isActionNeeded,
  matchInboxFilter,
  matchesInboxQuery,
  sliceInboxPage,
  type InboxState,
} from './mobile-inbox.logic';
import type { Part } from '../types';

const basePart = (over: Partial<Part> = {}): Part => ({
  id: '1',
  name: 'P',
  partNo: 'N',
  inst: '1',
  category: 'A',
  kishu: 'K1',
  finalDue: '2026-01-01',
  daysLeft: 5,
  totalShops: 10,
  doneShops: 5,
  remainShops: 5,
  buffer: -1,
  color: 'red',
  stagnant: 0,
  urgent: false,
  shortage: false,
  currentShop: 'S1',
  timeline: [],
  owner: '未割当',
  shelved: false,
  trouble: false,
  ...over,
});

const state = (over: Partial<InboxState> = {}): InboxState => ({
  tab: 'all',
  query: '',
  owner: 'all',
  kishu: 'all',
  stagnantThreshold: 10,
  checkedIds: new Set<string>(),
  showChecked: false,
  ...over,
});

describe('mobile-inbox.logic', () => {
  it('searches part name, part number, OS_ID and kishu', () => {
    const p = basePart({ id: 'OS-001', partNo: 'ABC-999', name: '弁座', kishu: 'K7' });
    expect(matchesInboxQuery(p, 'abc')).toBe(true);
    expect(matchesInboxQuery(p, '弁座')).toBe(true);
    expect(matchesInboxQuery(p, 'os-001')).toBe(true);
    expect(matchesInboxQuery(p, 'k7')).toBe(true);
    expect(matchesInboxQuery(p, 'zzz')).toBe(false);
    expect(matchesInboxQuery(p, '  ')).toBe(true);
  });

  it('treats red, yellow and stagnant parts as 要対応', () => {
    expect(isActionNeeded(basePart({ color: 'red', stagnant: 0 }), 10)).toBe(true);
    expect(isActionNeeded(basePart({ color: 'yellow', stagnant: 0 }), 10)).toBe(true);
    expect(isActionNeeded(basePart({ color: 'green', stagnant: 12 }), 10)).toBe(true);
    expect(isActionNeeded(basePart({ color: 'green', stagnant: 3 }), 10)).toBe(false);
  });

  it('always hides shelved parts', () => {
    expect(matchInboxFilter(basePart({ shelved: true }), state())).toBe(false);
    expect(matchInboxFilter(basePart({ shelved: true }), state({ showChecked: true }))).toBe(false);
  });

  it('hides checked parts until showChecked is on', () => {
    const checkedIds = new Set(['1']);
    expect(matchInboxFilter(basePart(), state({ checkedIds }))).toBe(false);
    expect(matchInboxFilter(basePart(), state({ checkedIds, showChecked: true }))).toBe(true);
  });

  it('filters by tab', () => {
    const green = basePart({ color: 'green', stagnant: 0 });
    expect(matchInboxFilter(green, state({ tab: 'action' }))).toBe(false);
    expect(matchInboxFilter(green, state({ tab: 'all' }))).toBe(true);
    expect(matchInboxFilter(green, state({ tab: 'trouble' }))).toBe(false);
    expect(matchInboxFilter(basePart({ trouble: true }), state({ tab: 'trouble' }))).toBe(true);
  });

  it('filters by owner treating missing owner as 未割当', () => {
    expect(matchInboxFilter(basePart({ owner: undefined }), state({ owner: '未割当' }))).toBe(true);
    expect(matchInboxFilter(basePart({ owner: '山田' }), state({ owner: '山田' }))).toBe(true);
    expect(matchInboxFilter(basePart({ owner: '山田' }), state({ owner: '鈴木' }))).toBe(false);
  });

  it('orders by color, then smaller buffer, then longer stagnation', () => {
    const red = basePart({ id: 'r', color: 'red', buffer: -1 });
    const redWorse = basePart({ id: 'r2', color: 'red', buffer: -5 });
    const yellow = basePart({ id: 'y', color: 'yellow', buffer: 0 });
    const green = basePart({ id: 'g', color: 'green', buffer: 9 });
    const sorted = [green, yellow, red, redWorse].sort(compareInboxPriority);
    expect(sorted.map((p) => p.id)).toEqual(['r2', 'r', 'y', 'g']);

    const tieA = basePart({ id: 'a', color: 'red', buffer: -1, stagnant: 3 });
    const tieB = basePart({ id: 'b', color: 'red', buffer: -1, stagnant: 12 });
    expect([tieA, tieB].sort(compareInboxPriority).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('sorts equal parts stably by id', () => {
    const a = basePart({ id: 'B' });
    const b = basePart({ id: 'A' });
    expect([a, b].sort(compareInboxPriority).map((p) => p.id)).toEqual(['A', 'B']);
  });

  it('buildInbox filters then sorts', () => {
    const parts = [
      basePart({ id: 'g', color: 'green', buffer: 5, stagnant: 0 }),
      basePart({ id: 'r', color: 'red', buffer: -2 }),
      basePart({ id: 'shelved', color: 'red', buffer: -9, shelved: true }),
    ];
    expect(buildInbox(parts, state()).map((p) => p.id)).toEqual(['r', 'g']);
    expect(buildInbox(parts, state({ tab: 'action' })).map((p) => p.id)).toEqual(['r']);
  });

  it('counts tabs after owner filter but ignores the active tab and query', () => {
    const parts = [
      basePart({ id: 'a', owner: '山田', color: 'red' }),
      basePart({ id: 'b', owner: '山田', color: 'green', stagnant: 0, trouble: true }),
      basePart({ id: 'c', owner: '鈴木', color: 'red' }),
    ];
    const counts = countInboxTabs(parts, state({ tab: 'trouble', owner: '山田', query: 'zzz' }));
    expect(counts).toEqual({ all: 2, action: 1, trouble: 1 });
  });

  it('excludes checked parts from tab counts', () => {
    const parts = [basePart({ id: 'a' }), basePart({ id: 'b' })];
    expect(countInboxTabs(parts, state({ checkedIds: new Set(['a']) })).all).toBe(1);
  });

  it('caps the painted list so phones do not mount every card', () => {
    const parts = Array.from({ length: 100 }, (_, i) => basePart({ id: String(i) }));
    expect(sliceInboxPage(parts, 40)).toHaveLength(40);
    expect(sliceInboxPage(parts, 40).map((p) => p.id)).toEqual(parts.slice(0, 40).map((p) => p.id));
    expect(sliceInboxPage(parts, 200)).toHaveLength(100);
  });
});
