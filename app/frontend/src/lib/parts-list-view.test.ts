import { describe, expect, it, beforeEach } from 'vitest';
import { loadPartsListView, savePartsListView, WATCH_LIST_VIEW_KEY } from './parts-list-view';

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

  it('keeps watch view page separate from parts list', () => {
    savePartsListView({
      filter: 'all',
      query: '',
      cat: 'all',
      owner: 'all',
      showShelved: false,
      pageIndex: 4,
      pageSize: 50,
      sorting: [{ id: 'sev', desc: false }],
    });
    savePartsListView({
      filter: 'all',
      query: '',
      cat: 'all',
      owner: 'all',
      showShelved: false,
      pageIndex: 0,
      pageSize: 30,
      sorting: [{ id: 'sev', desc: false }],
    }, WATCH_LIST_VIEW_KEY);
    expect(loadPartsListView().pageIndex).toBe(4);
    expect(loadPartsListView(WATCH_LIST_VIEW_KEY).pageIndex).toBe(0);
  });

  it('falls back on invalid page size', () => {
    sessionStorage.setItem('mop_parts_list_view', JSON.stringify({ pageSize: 7, filter: 'nope' }));
    const loaded = loadPartsListView();
    expect(loaded.pageSize).toBe(30);
    expect(loaded.filter).toBe('all');
  });
});
