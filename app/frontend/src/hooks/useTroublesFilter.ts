import { useCallback, useMemo, useState } from 'react';
import type { Part } from '../types';
import { facetOptions } from '../lib/facet';

export type DurationFilter = 'all' | 'fresh' | 'watch' | 'critical';
export type ChipFilter = 'all' | 'nomemo' | 'unassigned' | DurationFilter;

export function troubleUrgency(days: number | null | undefined): 'fresh' | 'watch' | 'critical' {
  const d = days ?? 0;
  if (d >= 7) return 'critical';
  if (d >= 3) return 'watch';
  return 'fresh';
}

export function troubleUrgencyLabel(days: number | null | undefined): string {
  const u = troubleUrgency(days);
  if (u === 'critical') return '7日以上';
  if (u === 'watch') return '3〜6日';
  return '0〜2日';
}

export function computeTroublesKpi(
  troubles: Part[],
  match: (p: Part, except: 'cat' | 'kishu' | 'owner' | 'chip' | null) => boolean,
) {
  const f = troubles.filter((p) => match(p, 'chip'));
  const cnt = (pred: (p: Part) => boolean) => f.filter(pred).length;
  const un = (p: Part) => (p.owner ?? '未割当') === '未割当';
  return {
    total: f.length,
    critical: cnt((p) => troubleUrgency(p.troubleDays) === 'critical'),
    nomemo: cnt((p) => !(p.memo ?? '').trim()),
    unassigned: cnt(un),
  };
}

export function useTroublesFilter(troubles: Part[], defaultOwnerFilter?: string) {
  const [filter, setFilter] = useState<ChipFilter>('all');
  const [cat, setCat] = useState('all');
  const [owner, setOwner] = useState(defaultOwnerFilter ?? 'all');
  const [kishu, setKishu] = useState('all');

  const toggleFilter = (next: ChipFilter) => setFilter((cur) => (cur === next ? 'all' : next));

  const matchDuration = (p: Part, dur: DurationFilter) => {
    if (dur === 'all') return true;
    return troubleUrgency(p.troubleDays) === dur;
  };

  const match = useCallback(
    (p: Part, except: 'cat' | 'kishu' | 'owner' | 'chip' | null) => {
      if (except !== 'cat' && cat !== 'all' && p.category !== cat) return false;
      if (except !== 'kishu' && kishu !== 'all' && p.kishu !== kishu) return false;
      if (except !== 'owner' && owner !== 'all' && (p.owner ?? '未割当') !== owner) return false;
      if (except !== 'chip') {
        if (filter === 'nomemo' && (p.memo ?? '').trim()) return false;
        if (filter === 'unassigned' && (p.owner ?? '未割当') !== '未割当') return false;
        if (['fresh', 'watch', 'critical'].includes(filter) && !matchDuration(p, filter as DurationFilter)) return false;
      }
      return true;
    },
    [cat, kishu, owner, filter],
  );

  const filtered = useMemo(() => troubles.filter((p) => match(p, null)), [troubles, match]);

  const cats = useMemo(
    () => facetOptions(troubles.filter((p) => match(p, 'cat')).map((p) => p.category), cat),
    [troubles, match, cat],
  );
  const kishus = useMemo(
    () => facetOptions(troubles.filter((p) => match(p, 'kishu')).map((p) => p.kishu).filter(Boolean), kishu),
    [troubles, match, kishu],
  );
  const ownerOpts = useMemo(
    () => facetOptions(troubles.filter((p) => match(p, 'owner')).map((p) => p.owner ?? '未割当'), owner),
    [troubles, match, owner],
  );

  const kpi = useMemo(() => computeTroublesKpi(troubles, match), [troubles, match]);

  return {
    filter,
    setFilter,
    toggleFilter,
    cat,
    setCat,
    owner,
    setOwner,
    kishu,
    setKishu,
    filtered,
    cats,
    kishus,
    ownerOpts,
    kpi,
  };
}
