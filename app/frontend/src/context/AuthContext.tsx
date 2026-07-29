import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as api from '../api';
import type { Me } from '../api';

interface AuthContextValue {
  me: Me | null;
  booting: boolean;
  bootError: string | null;
  needsSetup: boolean;
  admin: boolean;
  setMe: (u: Me | null) => void;
  setNeedsSetup: (v: boolean) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const u = await api.authMe();
        if (u) {
          setMe(u);
        } else {
          try {
            const s = await api.authSetupInfo();
            setNeedsSetup(s.needsSetup);
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        setBootError(e instanceof Error ? e.message : String(e));
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onExpired = () => setMe(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    setMe(null);
  }, []);

  const value = useMemo(
    () => ({
      me,
      booting,
      bootError,
      needsSetup,
      admin: me?.role === '管理者',
      setMe,
      setNeedsSetup,
      logout,
    }),
    [me, booting, bootError, needsSetup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
