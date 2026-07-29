// API クライアント（契約は据え置き＝バックの /api/* をそのまま呼ぶ）。
// 認証は httpOnly Cookie。全リクエストで credentials を送る。
import type { Part, Meta, MasterDef, AuditRow, AuditSearchResult, IngestInfo, IngestJob, IngestFile, OwnersData } from './types';

// 認証ユーザー
export interface Me {
  userId: number;
  email: string;
  displayName: string;
  role: string;
}
export interface AppUser extends Me {
  active: boolean;
}

const withCreds = (o: RequestInit = {}): RequestInit => ({ credentials: 'include', ...o });

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    if (r.status === 401) {
      window.dispatchEvent(new Event('auth:expired'));
    }
    // NestExceptionのbody（{message}）があればユーザー向けメッセージとして拾う
    let msg = `API ${r.status} ${r.statusText}`;
    try {
      const b = (await r.json()) as { message?: unknown };
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : String(b.message);
    } catch {
      /* JSON以外は無視 */
    }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}
function get<T>(url: string): Promise<T> {
  return fetch(url, withCreds()).then(j<T>);
}
function post<T = unknown>(url: string, body: unknown): Promise<T> {
  return fetch(url, withCreds({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).then(j<T>);
}
function patch<T = unknown>(url: string, body: unknown): Promise<T> {
  return fetch(url, withCreds({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).then(j<T>);
}

// ===== 認証 =====
export async function authMe(): Promise<Me | null> {
  const r = await fetch('/api/auth/me', withCreds());
  if (r.status === 401) return null;
  return j<{ user: Me | null }>(r).then((res) => res.user);
}
export const authSetupInfo = () => get<{ needsSetup: boolean }>('/api/auth/setup');
export const authSetup = (email: string, password: string, displayName: string) =>
  post<{ user: Me }>('/api/auth/setup', { email, password, displayName });
export const login = (email: string, password: string) => post<{ user: Me }>('/api/auth/login', { email, password });
export const logout = () => post('/api/auth/logout', {});
export const createUser = (body: { email: string; password: string; displayName: string; role: string }) =>
  post<AppUser>('/api/auth/users', body);
export const updateUser = (
  id: number,
  body: { displayName?: string; role?: string; active?: boolean; email?: string; password?: string },
) => patch<AppUser>(`/api/auth/users/${encodeURIComponent(id)}`, body);

// ===== 業務 =====
export const getMeta = () => get<Meta>('/api/meta');
export const getParts = () => get<Part[]>('/api/parts');
export const setOwner = (id: string, owner: string) => post(`/api/parts/${encodeURIComponent(id)}/owner`, { owner });
export const setTrouble = (id: string, flagged: boolean) => post(`/api/parts/${encodeURIComponent(id)}/trouble`, { flagged });
export const setShelved = (id: string, flagged: boolean) => post(`/api/parts/${encodeURIComponent(id)}/shelved`, { flagged });
export const setMemo = (id: string, memo: string) => post(`/api/parts/${encodeURIComponent(id)}/memo`, { memo });
export const setNote = (id: string, note: string) => post(`/api/parts/${encodeURIComponent(id)}/note`, { note });

export const getMasters = () => get<MasterDef[]>('/api/masters');
export const getMasterRows = (name: string) => get<Record<string, unknown>[]>(`/api/masters/${encodeURIComponent(name)}`);
export const saveMasterRow = (name: string, row: Record<string, unknown>) => post(`/api/masters/${encodeURIComponent(name)}`, row);
export const deleteMasterRow = (name: string, id: string) =>
  fetch(`/api/masters/${encodeURIComponent(name)}/${encodeURIComponent(id)}`, withCreds({ method: 'DELETE' })).then(j);
export const recompute = () => post<{ parts: number; timeline: number }>('/api/recompute', {});
export const getAudit = () => get<AuditRow[]>('/api/audit');

export interface AuditSearchParams {
  target?: string;
  from?: string;
  to?: string;
  actionPrefix?: string;
  page?: number;
  pageSize?: number;
}

function auditQuery(params: AuditSearchParams & { format?: string }): string {
  const q = new URLSearchParams();
  if (params.target) q.set('target', params.target);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.actionPrefix) q.set('actionPrefix', params.actionPrefix);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  if (params.format) q.set('format', params.format);
  return q.toString();
}

export const searchAudit = (params: AuditSearchParams) =>
  get<AuditSearchResult>(`/api/audit?${auditQuery(params)}`);

export const downloadAuditCsv = async (params: AuditSearchParams): Promise<void> => {
  const r = await fetch(`/api/audit?${auditQuery({ ...params, format: 'csv' })}`, withCreds());
  if (!r.ok) {
    let msg = `API ${r.status} ${r.statusText}`;
    try {
      const b = (await r.json()) as { message?: unknown };
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : String(b.message);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `master-history_${params.from ?? 'all'}_${params.to ?? 'all'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// 担当者の自動割り当て（未割当のみ対象）
export const autoAssign = () =>
  post<{ ok: boolean; targeted: number; assigned: number; leftover: number; byOwner: { owner: string; count: number }[] }>(
    '/api/assign/auto',
    {},
  );

// 担当者マスタ（担当者×機種）
export const getOwners = () => get<OwnersData>('/api/owners');
export const toggleOwnerKishu = (ownerId: number, kishu: string, on: boolean) =>
  post(`/api/owners/${encodeURIComponent(ownerId)}/kishu`, { kishu, on });

// 取込：状態取得（ポーリング用）と開始。開始は409/422でもボディを読むため生fetch
export const getIngest = () => get<IngestInfo>('/api/ingest');
export const runIngest = async (): Promise<{ status: number; started: boolean; reason?: 'busy' | 'preflight'; job?: IngestJob; files?: IngestFile[] }> => {
  const r = await fetch('/api/ingest', withCreds({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ...data };
};
