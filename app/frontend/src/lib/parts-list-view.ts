import type { SortingState } from '@tanstack/react-table';
import type { ChipFilter } from '../lib/parts-filter.logic';

const VIEW_KEY = 'mop_parts_list_view';
const CHIP: ChipFilter[] = ['all', 'risk', 'red', 'yellow', 'green', 'stag'];
const PAGE_SIZES = [30, 50, 100, 500];

export type PartsListViewState = {
  filter: ChipFilter;
  query: string;
  cat: string;
  owner: string;
  showShelved: boolean;
  pageIndex: number;
  pageSize: number;
  sorting: SortingState;
};

const defaults: PartsListViewState = {
  filter: 'all',
  query: '',
  cat: 'all',
  owner: 'all',
  showShelved: false,
  pageIndex: 0,
  pageSize: 30,
  sorting: [{ id: 'sev', desc: false }],
};

function isChip(v: unknown): v is ChipFilter {
  return typeof v === 'string' && (CHIP as string[]).includes(v);
}

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function loadPartsListView(): PartsListViewState {
  try {
    const raw = storage()?.getItem(VIEW_KEY);
    if (!raw) return { ...defaults, sorting: [...defaults.sorting] };
    const p = JSON.parse(raw) as Partial<PartsListViewState>;
    const pageSize = PAGE_SIZES.includes(Number(p.pageSize) as (typeof PAGE_SIZES)[number]) ? Number(p.pageSize) : 30;
    const pageIndex = Number.isFinite(Number(p.pageIndex)) && Number(p.pageIndex) >= 0 ? Math.floor(Number(p.pageIndex)) : 0;
    const sorting = Array.isArray(p.sorting) && p.sorting.length
      ? p.sorting.filter((s) => s && typeof s.id === 'string').map((s) => ({ id: s.id, desc: Boolean(s.desc) }))
      : [...defaults.sorting];
    return {
      filter: isChip(p.filter) ? p.filter : 'all',
      query: typeof p.query === 'string' ? p.query : '',
      cat: typeof p.cat === 'string' ? p.cat : 'all',
      owner: typeof p.owner === 'string' ? p.owner : 'all',
      showShelved: Boolean(p.showShelved),
      pageIndex,
      pageSize,
      sorting: sorting.length ? sorting : [...defaults.sorting],
    };
  } catch {
    return { ...defaults, sorting: [...defaults.sorting] };
  }
}

export function savePartsListView(state: PartsListViewState): void {
  try {
    storage()?.setItem(VIEW_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}
