import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Part } from '../types';
import { facetOptions } from '../lib/facet';
import { computePartsKpi, matchPartsFilter, resolveKishuFilter, type ChipFilter } from '../lib/parts-filter.logic';
import { loadPartsListView } from '../lib/parts-list-view';

export type { ChipFilter };

export type PartsFilterOptions = {
  defaultOwnerFilter?: string;
  myKishus?: string[];
  isEngineer?: boolean;
  viewStorageKey?: string;
};

export function usePartsFilter(
  parts: Part[],
  stagnantThreshold: number,
  options: PartsFilterOptions = {},
) {
  const { defaultOwnerFilter, myKishus, isEngineer, viewStorageKey } = options;
  const stored = useMemo(() => loadPartsListView(viewStorageKey), [viewStorageKey]);
  const [filter, setFilter] = useState<ChipFilter>(stored.filter);
  const [cat, setCat] = useState(stored.cat);
  const [owner, setOwner] = useState(defaultOwnerFilter ?? (isEngineer ? stored.owner : 'all'));
  const [kishu, setKishu] = useState(() => resolveKishuFilter(localStorage.getItem('mop_kishu'), isEngineer, myKishus));
  const [showShelved, setShowShelved] = useState(stored.showShelved);
  const [query, setQuery] = useState(stored.query);

  useEffect(() => {
    localStorage.setItem('mop_kishu', kishu);
  }, [kishu]);

  const toggleFilter = (next: ChipFilter) => setFilter((cur) => (cur === next ? 'all' : next));

  const filterState = useMemo(
    () => ({ filter, cat, kishu, owner, query, showShelved, stagnantThreshold, myKishus }),
    [filter, cat, kishu, owner, query, showShelved, stagnantThreshold, myKishus],
  );

  const match = useCallback(
    (p: Part, except: 'cat' | 'kishu' | 'owner' | 'chip' | null) => matchPartsFilter(p, filterState, except),
    [filterState],
  );

  const filtered = useMemo(() => parts.filter((p) => match(p, null)), [parts, match]);
  const shelvedCount = useMemo(() => parts.filter((p) => p.shelved).length, [parts]);
  const cats = useMemo(() => facetOptions(parts.filter((p) => match(p, 'cat')).map((p) => p.category), cat), [parts, match, cat]);
  const kishus = useMemo(
    () => facetOptions(parts.filter((p) => match(p, 'kishu')).map((p) => p.kishu).filter(Boolean), kishu),
    [parts, match, kishu],
  );
  const ownerOpts = useMemo(
    () => facetOptions(parts.filter((p) => match(p, 'owner')).map((p) => p.owner ?? '未割当'), owner),
    [parts, match, owner],
  );

  const kpi = useMemo(() => computePartsKpi(parts, filterState), [parts, filterState]);

  return {
    filter,
    cat,
    owner,
    kishu,
    query,
    showShelved,
    setQuery,
    setCat,
    setOwner,
    setKishu,
    setShowShelved,
    toggleFilter,
    setFilter,
    filtered,
    shelvedCount,
    cats,
    kishus,
    ownerOpts,
    kpi,
    match,
    myKishus,
  };
}
