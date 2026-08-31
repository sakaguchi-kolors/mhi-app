import type { Part } from '../types';

export type ChipFilter = 'all' | 'risk' | 'red' | 'yellow' | 'green' | 'stag';

export type PartsFilterState = {
  filter: ChipFilter;
  cat: string;
  kishu: string;
  owner: string;
  query: string;
  showShelved: boolean;
  stagnantThreshold: number;
  myKishus?: string[];
};

function matchesPartsQuery(p: Part, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${p.name} ${p.id}`.toLowerCase();
  return hay.includes(q);
}

export function matchPartsFilter(
  p: Part,
  state: PartsFilterState,
  except: 'cat' | 'kishu' | 'owner' | 'chip' | null,
): boolean {
  const { filter, cat, kishu, owner, query, showShelved, stagnantThreshold, myKishus } = state;
  if (!matchesPartsQuery(p, query)) return false;
  if ((p.shelved ?? false) !== showShelved) return false;
  if (except !== 'cat' && cat !== 'all' && p.category !== cat) return false;
  if (except !== 'kishu' && kishu !== 'all') {
    if (kishu === 'mine') {
      if (!myKishus?.length || !myKishus.includes(p.kishu)) return false;
    } else if (p.kishu !== kishu) return false;
  }
  if (except !== 'owner' && owner !== 'all' && (p.owner ?? '未割当') !== owner) return false;
  if (except !== 'chip') {
    if (filter === 'risk' && p.color === 'green') return false;
    if (filter === 'red' && p.color !== 'red') return false;
    if (filter === 'yellow' && p.color !== 'yellow') return false;
    if (filter === 'green' && p.color !== 'green') return false;
    if (filter === 'stag' && p.stagnant < stagnantThreshold) return false;
  }
  return true;
}

export function computePartsKpi(parts: Part[], state: PartsFilterState) {
  const f = parts.filter((p) => matchPartsFilter(p, { ...state, query: '' }, 'chip'));
  const cnt = (pred: (p: Part) => boolean) => f.filter(pred).length;
  const un = (p: Part) => (p.owner ?? '未割当') === '未割当';
  return {
    r: cnt((p) => p.color === 'red'),
    y: cnt((p) => p.color === 'yellow'),
    g: cnt((p) => p.color === 'green'),
    s: cnt((p) => p.stagnant >= state.stagnantThreshold),
    ru: cnt((p) => p.color === 'red' && un(p)),
    yu: cnt((p) => p.color === 'yellow' && un(p)),
    su: cnt((p) => p.stagnant >= state.stagnantThreshold && un(p)),
  };
}
