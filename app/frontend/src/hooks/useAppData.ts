import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Part } from '../types';
import * as api from '../api';
import type { RecomputeResult } from '../api';
import { timelineCacheKey } from './usePartTimelines';
import { metaQueryKey, partsSummaryQueryKey } from '../lib/queryClient';

export function useMeta(enabled: boolean, userId?: number) {
  return useQuery({
    queryKey: metaQueryKey(userId),
    queryFn: api.getMeta,
    enabled,
  });
}

export function usePartMutations(toast: { show: (msg: string) => void }, userId?: number) {
  const qc = useQueryClient();
  const summaryKey = partsSummaryQueryKey(userId);

  const invalidate = useCallback(() => {
    qc.removeQueries({ queryKey: timelineCacheKey });
    qc.invalidateQueries({ queryKey: ['parts'] });
  }, [qc]);

  const patchPart = useCallback(
    (id: string, patch: Partial<Part>) => {
      qc.setQueryData<Part[]>(summaryKey, (prev) =>
        prev?.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      );
    },
    [qc, summaryKey],
  );

  const mutate = useMutation({
    mutationFn: async ({ fn, okPatch }: { fn: () => Promise<unknown>; okPatch?: () => void }) => {
      await fn();
      okPatch?.();
    },
    onError: (e) => {
      console.error(e);
      toast.show('保存に失敗しました（変更は反映されていません）');
      invalidate();
    },
  });

  const onOwner = useCallback(
    (id: string, owner: string) =>
      mutate.mutate({
        fn: () => api.setOwner(id, owner),
        okPatch: () => patchPart(id, { owner, ownerDays: owner === '未割当' ? null : 0 }),
      }),
    [mutate, patchPart],
  );

  const onTrouble = useCallback(
    (id: string, flagged: boolean) =>
      mutate.mutate({
        fn: () => api.setTrouble(id, flagged),
        okPatch: () => patchPart(id, { trouble: flagged, troubleDays: flagged ? 0 : null }),
      }),
    [mutate, patchPart],
  );

  const onShelved = useCallback(
    (id: string, flagged: boolean) =>
      mutate.mutate({
        fn: () => api.setShelved(id, flagged),
        okPatch: () => patchPart(id, { shelved: flagged }),
      }),
    [mutate, patchPart],
  );

  const onWatch = useCallback(
    (id: string, flagged: boolean) =>
      mutate.mutate({
        fn: () => api.setWatch(id, flagged),
        okPatch: () => patchPart(id, { watch: flagged }),
      }),
    [mutate, patchPart],
  );

  const onMemo = useCallback(
    (id: string, memo: string) =>
      mutate.mutate({
        fn: () => api.setMemo(id, memo),
        okPatch: () => patchPart(id, { memo }),
      }),
    [mutate, patchPart],
  );

  const onNote = useCallback(
    (id: string, note: string) =>
      mutate.mutate({
        fn: () => api.setNote(id, note),
        okPatch: () => patchPart(id, { note }),
      }),
    [mutate, patchPart],
  );

  const recomputeMutation = useMutation({
    mutationFn: api.recompute,
  });

  const runRecompute = useCallback(
    async (opts?: { background?: boolean }): Promise<RecomputeResult> => {
      const result = await recomputeMutation.mutateAsync();
      const inv = (async () => {
        qc.removeQueries({ queryKey: timelineCacheKey });
        await qc.invalidateQueries({ queryKey: ['parts'] });
      })();
      if (opts?.background) void inv;
      else await inv;
      return result;
    },
    [qc, recomputeMutation],
  );

  const autoAssign = useMutation({
    mutationFn: api.autoAssign,
    onSuccess: invalidate,
  });

  return {
    onOwner,
    onTrouble,
    onShelved,
    onWatch,
    onMemo,
    onNote,
    recompute: recomputeMutation,
    runRecompute,
    autoAssign,
    invalidate,
  };
}

function formatQueryError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export type AppData = {
  parts: Part[];
  meta: import('../types').Meta | null;
  isLoading: boolean;
  loadError: string | null;
  reload: () => Promise<void>;
};

export function useAppData(enabled: boolean, userId?: number): AppData {
  const metaQ = useMeta(enabled, userId);
  const summaryKey = partsSummaryQueryKey(userId);
  const summaryQ = useQuery({
    queryKey: summaryKey,
    queryFn: api.getParts,
    enabled,
  });
  const qc = useQueryClient();

  const loadError =
    metaQ.error != null
      ? formatQueryError(metaQ.error)
      : summaryQ.error != null
        ? formatQueryError(summaryQ.error)
        : null;

  const isLoading = enabled && summaryQ.isLoading;

  const reload = async () => {
    qc.removeQueries({ queryKey: timelineCacheKey });
    await Promise.all([
      qc.invalidateQueries({ queryKey: metaQueryKey(userId) }),
      qc.invalidateQueries({ queryKey: ['parts'] }),
    ]);
  };

  return {
    parts: summaryQ.data ?? [],
    meta: metaQ.data ?? null,
    isLoading,
    loadError,
    reload,
  };
}
