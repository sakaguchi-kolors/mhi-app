import { useCallback, useEffect, useState, useTransition } from 'react';
import { flushSync } from 'react-dom';

/** クライアント側ページネーション切替時に薄いローディングを出す */
export function usePagedTableTransition() {
  const [isPending, startTransition] = useTransition();
  const [veil, setVeil] = useState(false);

  const runTransition = useCallback(
    (action: () => void) => {
      flushSync(() => setVeil(true));
      startTransition(action);
    },
    [startTransition],
  );

  useEffect(() => {
    if (!isPending && veil) setVeil(false);
  }, [isPending, veil]);

  // 万一 isPending が残った場合の保険
  useEffect(() => {
    if (!veil && !isPending) return;
    const t = window.setTimeout(() => setVeil(false), 15000);
    return () => window.clearTimeout(t);
  }, [veil, isPending]);

  return { busy: veil || isPending, runTransition };
}
