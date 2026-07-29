import { useMemo, useState } from 'react';
import type { Row } from './shared';

/** マスタ Editor 共通：行ドラフト管理 */
export function useMasterDrafts(rows: Row[], rowKey: (row: Row) => string) {
  const [drafts, setDrafts] = useState<Record<string, Row>>({});

  const viewRows = useMemo(
    () =>
      rows.map((r) => {
        const key = rowKey(r);
        return drafts[key] ? { ...r, ...drafts[key] } : r;
      }),
    [rows, drafts, rowKey],
  );

  const patchDraft = (key: string, patch: Partial<Row>) => {
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...patch } }));
  };

  const clearDraft = (key: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return { viewRows, drafts, patchDraft, clearDraft };
}
