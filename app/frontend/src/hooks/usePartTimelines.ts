import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TimelineCell } from '../types';
import * as api from '../api';

export const timelineCacheKey = ['parts', 'timelineCache'] as const;

/** 指定部品IDのタイムラインをキャッシュしつつ、未取得分だけAPI取得 */
export function usePartTimelines(ids: string[]) {
  const qc = useQueryClient();
  const [version, setVersion] = useState(0);
  const cache = qc.getQueryData<Record<string, TimelineCell[]>>(timelineCacheKey) ?? {};

  const missing = useMemo(() => {
    const uniq = [...new Set(ids.filter(Boolean))];
    return uniq.filter((id) => !cache[id]);
    // version: キャッシュ更新後に missing を再計算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, version]);

  const fetchQ = useQuery({
    queryKey: ['parts', 'timelines', 'batch', missing.join('\0')],
    queryFn: async () => {
      const chunk = await api.getPartTimelines(missing);
      qc.setQueryData<Record<string, TimelineCell[]>>(timelineCacheKey, (old) => ({
        ...(old ?? {}),
        ...chunk,
      }));
      setVersion((v) => v + 1);
      return chunk;
    },
    enabled: missing.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const timelines = qc.getQueryData<Record<string, TimelineCell[]>>(timelineCacheKey) ?? cache;

  return {
    timelines,
    loading: fetchQ.isFetching,
  };
}

export function mergePartTimeline<T extends { id: string; timeline: TimelineCell[] }>(
  part: T,
  timelines: Record<string, TimelineCell[]>,
): T {
  const tl = timelines[part.id];
  if (!tl) return part;
  return { ...part, timeline: tl };
}
