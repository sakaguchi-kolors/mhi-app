// API クライアント（契約は据え置き＝バックの /api/* をそのまま呼ぶ）
import type { Part, Meta, MasterDef, AuditRow, IngestInfo, IngestJob, IngestFile, OwnersData } from './types';

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`API ${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}
function post<T = unknown>(url: string, body: unknown): Promise<T> {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j<T>);
}

export const getMeta = () => fetch('/api/meta').then(j<Meta>);
export const getParts = () => fetch('/api/parts').then(j<Part[]>);
export const setOwner = (id: string, owner: string) => post(`/api/parts/${id}/owner`, { owner });
export const setTrouble = (id: string, flagged: boolean) => post(`/api/parts/${id}/trouble`, { flagged });
export const setMemo = (id: string, memo: string) => post(`/api/parts/${id}/memo`, { memo });
export const setNote = (id: string, note: string) => post(`/api/parts/${id}/note`, { note });

export const getMasters = () => fetch('/api/masters').then(j<MasterDef[]>);
export const getMasterRows = (name: string) => fetch(`/api/masters/${name}`).then(j<Record<string, unknown>[]>);
export const saveMasterRow = (name: string, row: Record<string, unknown>) => post(`/api/masters/${name}`, row);
export const deleteMasterRow = (name: string, id: string) =>
  fetch(`/api/masters/${name}/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(j);
export const recompute = () => post<{ parts: number; timeline: number }>('/api/recompute', {});
export const getAudit = () => fetch('/api/audit').then(j<AuditRow[]>);

// 担当者の自動割り当て（未割当のみ対象）
export const autoAssign = () => post<{ ok: boolean; targeted: number; assigned: number; leftover: number; byOwner: { owner: string; count: number }[] }>('/api/assign/auto', {});

// 担当者マスタ（担当者×機種）
export const getOwners = () => fetch('/api/owners').then(j<OwnersData>);
export const toggleOwnerKishu = (ownerId: number, kishu: string, on: boolean) => post(`/api/owners/${ownerId}/kishu`, { kishu, on });

// 取込：状態取得（ポーリング用）と開始。開始は409/422でもボディを読むため生fetch
export const getIngest = () => fetch('/api/ingest').then(j<IngestInfo>);
export const runIngest = async (): Promise<{ status: number; started: boolean; reason?: 'busy' | 'preflight'; job?: IngestJob; files?: IngestFile[] }> => {
  const r = await fetch('/api/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ...data };
};
