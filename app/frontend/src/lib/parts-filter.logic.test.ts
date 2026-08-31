import { describe, expect, it } from 'vitest';
import { matchPartsFilter, computePartsKpi, resolveKishuFilter } from './parts-filter.logic';
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
  stagnant: 12,
  urgent: false,
  shortage: false,
  currentShop: 'S1',
  timeline: [],
  owner: '未割当',
  shelved: false,
  trouble: false,
  ...over,
});

describe('parts-filter.logic', () => {
  it('filters by color chip', () => {
    const state = { filter: 'red' as const, cat: 'all', kishu: 'all', owner: 'all', query: '', showShelved: false, stagnantThreshold: 10 };
    expect(matchPartsFilter(basePart({ color: 'red' }), state, null)).toBe(true);
    expect(matchPartsFilter(basePart({ color: 'green' }), state, null)).toBe(false);
  });

  it('excludes shelved unless toggled', () => {
    const state = { filter: 'all' as const, cat: 'all', kishu: 'all', owner: 'all', query: '', showShelved: false, stagnantThreshold: 10 };
    expect(matchPartsFilter(basePart({ shelved: true }), state, null)).toBe(false);
    expect(matchPartsFilter(basePart({ shelved: undefined }), state, null)).toBe(true);
  });

  it('filters by part name or OS_ID query', () => {
    const state = { filter: 'all' as const, cat: 'all', kishu: 'all', owner: 'all', query: 'abc', showShelved: false, stagnantThreshold: 10 };
    expect(matchPartsFilter(basePart({ id: 'OS-ABC-001', name: '部品X' }), state, null)).toBe(true);
    expect(matchPartsFilter(basePart({ id: 'OS-999', name: 'ABC部品' }), state, null)).toBe(true);
    expect(matchPartsFilter(basePart({ id: 'OS-999', name: '部品Y' }), state, null)).toBe(false);
  });

  it('computePartsKpi ignores search query', () => {
    const parts = [basePart(), basePart({ id: '2', owner: 'Taro', color: 'green' })];
    const kpi = computePartsKpi(parts, { filter: 'all', cat: 'all', kishu: 'all', owner: 'all', query: 'nomatch', showShelved: false, stagnantThreshold: 10 });
    expect(kpi.r).toBe(1);
    expect(kpi.g).toBe(1);
  });

  it('resolveKishuFilter drops leftover mine for admin or empty kishus', () => {
    expect(resolveKishuFilter('mine', false, [])).toBe('all');
    expect(resolveKishuFilter('mine', true, [])).toBe('all');
    expect(resolveKishuFilter('mine', true, ['K1'])).toBe('mine');
    expect(resolveKishuFilter('K1', false, [])).toBe('K1');
    expect(resolveKishuFilter(null, true, ['K1'])).toBe('mine');
    expect(resolveKishuFilter(null, false, [])).toBe('all');
  });

  it('computePartsKpi counts unassigned on red', () => {
    const parts = [basePart(), basePart({ id: '2', owner: 'Taro', color: 'red' })];
    const kpi = computePartsKpi(parts, { filter: 'all', cat: 'all', kishu: 'all', owner: 'all', query: '', showShelved: false, stagnantThreshold: 10 });
    expect(kpi.r).toBe(2);
    expect(kpi.ru).toBe(1);
  });
});
