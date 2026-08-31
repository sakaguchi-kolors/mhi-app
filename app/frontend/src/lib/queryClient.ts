import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function clearAppQueryCache(): void {
  queryClient.clear();
}

const AUTH_SYNC_KEY = 'mhi_auth_sync';

/** ログイン/ログアウトを他タブへ通知 */
export function notifyAuthChange(): void {
  localStorage.setItem(AUTH_SYNC_KEY, String(Date.now()));
}

/** 他タブからの認証変更を監視 */
export function onAuthChangeFromOtherTab(cb: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === AUTH_SYNC_KEY) cb();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

export function partsSummaryQueryKey(userId?: number) {
  return ['parts', 'summary', userId ?? 'anon'] as const;
}

export function metaQueryKey(userId?: number) {
  return ['meta', userId ?? 'anon'] as const;
}
