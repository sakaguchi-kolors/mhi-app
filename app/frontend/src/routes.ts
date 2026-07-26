// アプリ内ルート定義（URLと画面を同期）
export const routes = {
  login: '/login',
  setup: '/setup',
  parts: '/parts',
  part: (id: string) => `/parts/${encodeURIComponent(id)}`,
  troubles: '/troubles',
  ingest: '/ingest',
  owners: '/owners',
  masters: '/masters',
  master: (name: string) => `/masters/${encodeURIComponent(name)}`,
  users: '/users',
} as const;

export type ScreenKey = 'parts' | 'detail' | 'troubles' | 'ingest' | 'owners' | 'masters' | 'users';

/** パスからサイドバーアクティブ判定用の画面キー */
export function screenFromPath(pathname: string): ScreenKey {
  if (pathname.startsWith('/parts/') && pathname !== '/parts') return 'detail';
  if (pathname === routes.troubles) return 'troubles';
  if (pathname === routes.ingest) return 'ingest';
  if (pathname === routes.owners) return 'owners';
  if (pathname === routes.masters || pathname.startsWith(`${routes.masters}/`)) return 'masters';
  if (pathname === routes.users) return 'users';
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
  troubles: '困りごと',
  ingest: 'データ取込',
  owners: '担当者',
  masters: 'マスタ管理',
  users: 'ユーザー管理',
};
