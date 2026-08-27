// PC画面とスマホ画面（/m）のどちらを開くかの判定。
// 端末幅で自動判定しつつ、ユーザーが選んだ側を localStorage で覚える。
import { routes } from '../routes';

export const VIEW_PREF_KEY = 'mop_view';

export type ViewPref = 'auto' | 'pc' | 'mobile';

/** これ以下の幅はスマホ画面を既定にする */
export const MOBILE_MAX_WIDTH = 640;

export function readViewPref(): ViewPref {
  if (typeof window === 'undefined') return 'auto';
  try {
    const v = window.localStorage.getItem(VIEW_PREF_KEY);
    return v === 'pc' || v === 'mobile' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function writeViewPref(v: ViewPref): void {
  try {
    if (v === 'auto') window.localStorage.removeItem(VIEW_PREF_KEY);
    else window.localStorage.setItem(VIEW_PREF_KEY, v);
  } catch {
    /* 書けなくても遷移自体は成立する */
  }
}

export function isNarrowViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
}

/**
 * 自動でスマホ画面に送るかどうか。
 * 入口（/ と /parts）に限定し、PC の他画面を開いている最中は横取りしない。
 */
export function shouldAutoRedirectToMobile(pathname: string, pref: ViewPref, narrow: boolean): boolean {
  if (pathname !== '/' && pathname !== routes.parts) return false;
  if (pref === 'pc') return false;
  if (pref === 'mobile') return true;
  return narrow;
}
