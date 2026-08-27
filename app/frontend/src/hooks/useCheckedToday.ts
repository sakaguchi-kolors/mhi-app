// 「今日は確認した」の状態を端末内（localStorage）で保持する。
// 第2弾でサーバー保存（部品×ユーザー×期限）に差し替える想定なので、
// 画面からはこのフックの API だけを使う。
import { useCallback, useMemo, useState } from 'react';
import {
  CHECKED_STORAGE_KEY,
  parseChecked,
  setChecked as applyChecked,
  type CheckedMap,
} from '../lib/mobile-checked.logic';

function read(): CheckedMap {
  if (typeof window === 'undefined') return {};
  try {
    return parseChecked(window.localStorage.getItem(CHECKED_STORAGE_KEY), new Date());
  } catch {
    return {};
  }
}

function write(map: CheckedMap): void {
  try {
    window.localStorage.setItem(CHECKED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* プライベートモード等で書けなくても画面は動かす */
  }
}

export type CheckedToday = {
  /** 期限内の確認済み OS_ID */
  ids: ReadonlySet<string>;
  set: (osId: string, on: boolean) => void;
  clearAll: () => void;
};

export function useCheckedToday(): CheckedToday {
  const [map, setMap] = useState<CheckedMap>(read);

  const set = useCallback((osId: string, on: boolean) => {
    setMap((prev) => {
      const next = applyChecked(prev, osId, on, new Date());
      write(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setMap(() => {
      write({});
      return {};
    });
  }, []);

  const ids = useMemo(() => new Set(Object.keys(map)), [map]);

  return { ids, set, clearAll };
}
