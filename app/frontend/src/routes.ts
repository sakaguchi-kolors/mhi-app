// アプリ内ルート定義（URLと画面を同期）
export const routes = {
  login: '/login',
  setup: '/setup',
  parts: '/parts',
  part: (id: string) => `/parts/${encodeURIComponent(id)}`,
  heatmap: '/heatmap',
  watch: '/watch',
  watchPart: (id: string) => `/watch/${encodeURIComponent(id)}`,
  troubles: '/troubles',
  ingest: '/ingest',
  owners: '/owners',
  masters: '/masters',
  master: (name: string) => `/masters/${encodeURIComponent(name)}`,
  masterHistory: '/masters/history',
  // スマホ専用画面（PC画面の縮小ではなく別ルート）
  mobile: '/m',
  mobilePart: (id: string) => `/m/parts/${encodeURIComponent(id)}`,
} as const;

/** スマホ専用画面のパスか */
export function isMobilePath(pathname: string): boolean {
  return pathname === routes.mobile || pathname.startsWith(`${routes.mobile}/`);
}

export type ScreenKey = 'parts' | 'detail' | 'heatmap' | 'troubles' | 'watch' | 'ingest' | 'owners' | 'masters';

/** パスからサイドバーアクティブ判定用の画面キー */
export function screenFromPath(pathname: string): ScreenKey {
  if (pathname.startsWith('/parts/') && pathname !== '/parts') return 'detail';
  if (pathname.startsWith('/watch/') && pathname !== '/watch') return 'watch';
  if (pathname === routes.heatmap) return 'heatmap';
  if (pathname === routes.troubles) return 'troubles';
  if (pathname === routes.watch) return 'watch';
  if (pathname === routes.ingest) return 'ingest';
  if (pathname === routes.owners) return 'owners';
  if (pathname === routes.masters || pathname.startsWith(`${routes.masters}/`)) return 'masters';
  return 'parts';
}

/** /masters/:name からマスタ名を取り出す */
export function masterNameFromPath(pathname: string): string | null {
  if (!pathname.startsWith(`${routes.masters}/`)) return null;
  const rest = pathname.slice(routes.masters.length + 1);
  const name = decodeURIComponent(rest.split('/')[0] ?? '');
  return name || null;
}

export const PAGE_TITLES: Record<ScreenKey, string> = {
  parts: '部品一覧',
  detail: '部品詳細',
  heatmap: '工程ヒートマップ',
  troubles: '困りごと',
  watch: '要ウォッチ部品',
  ingest: 'データ取込',
  owners: '担当者',
  masters: 'マスタ管理',
};
