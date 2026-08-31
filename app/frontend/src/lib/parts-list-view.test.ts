import { describe, expect, it, beforeEach } from 'vitest';
import { loadPartsListView, savePartsListView } from './parts-list-view';

const mem = new Map<string, string>();
const mock: Storage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};

Object.defineProperty(globalThis, 'sessionStorage', { value: mock, configurable: true });

describe('parts-list-view', () => {
  beforeEach(() => mem.clear());
  it('round-trips filter, page size and sorting', () => {
    savePartsListView({
      filter: 'red',
      query: 'abc',
      cat: '機構部品',
      owner: '佐藤 健',
      showShelved: true,
      pageIndex: 2,
      pageSize: 100,
      sorting: [{ id: 'due', desc: true }],
    });
    const loaded = loadPartsListView();
    expect(loaded.filter).toBe('red');
    expect(loaded.query).toBe('abc');
    expect(loaded.cat).toBe('機構部品');
    expect(loaded.owner).toBe('佐藤 健');
    expect(loaded.showShelved).toBe(true);
    expect(loaded.pageIndex).toBe(2);
    expect(loaded.pageSize).toBe(100);
    expect(loaded.sorting).toEqual([{ id: 'due', desc: true }]);
  });

  it('falls back on invalid page size', () => {
    sessionStorage.setItem('mop_parts_list_view', JSON.stringify({ pageSize: 7, filter: 'nope' }));
    const loaded = loadPartsListView();
    expect(loaded.pageSize).toBe(30);
    expect(loaded.filter).toBe('all');
  });
});
