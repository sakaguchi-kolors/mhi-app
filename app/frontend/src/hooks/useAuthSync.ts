import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '../api';
import { clearAppQueryCache, onAuthChangeFromOtherTab } from '../lib/queryClient';

/** 他タブで別アカウントがログイン/ログアウトしたときにキャッシュを破棄して再認証 */
export function useAuthSync(setMe: (u: api.Me | null) => void) {
  const qc = useQueryClient();

  useEffect(() => {
    return onAuthChangeFromOtherTab(() => {
      clearAppQueryCache();
      void api.authMe().then((u) => setMe(u));
    });
  }, [qc, setMe]);
}

export { clearAppQueryCache, notifyAuthChange } from '../lib/queryClient';
