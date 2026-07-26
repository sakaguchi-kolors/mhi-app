import type { Color, Part } from '../../types';

export type Row = Record<string, unknown>;

export const RECOMPUTE_MASTERS = new Set(['param', 'milestone', 'shop_lt', 'calendar', 'category']);
export const PENDING_KEY = 'masters.pendingRecompute';
export const LAST_RECOMPUTE_KEY = 'masters.lastRecomputeAt';

export function bufferColor(buffer: number, green: number, yellow: number): Color {
  if (buffer >= green) return 'green';
  if (buffer >= yellow) return 'yellow';
  return 'red';
}

export function colorCounts(parts: Part[], green?: number, yellow?: number): Record<Color, number> {
  const out: Record<Color, number> = { green: 0, yellow: 0, red: 0 };
  for (const p of parts) {
    const c =
      green != null && yellow != null ? bufferColor(p.buffer, green, yellow) : p.color;
    out[c] += 1;
  }
  return out;
}

export function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function str(v: unknown): string {
  return v == null ? '' : String(v);
}

export function loadPending(): string[] {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export function savePending(names: string[]) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify([...new Set(names)]));
}

export function loadLastRecompute(): string | null {
  return sessionStorage.getItem(LAST_RECOMPUTE_KEY);
}

export function saveLastRecompute(iso: string) {
  sessionStorage.setItem(LAST_RECOMPUTE_KEY, iso);
}

export function matchMilestone(
  matchType: string,
  pattern: string,
  shop: string,
  name: string,
): boolean {
  if (!pattern) return false;
  if (matchType === 'name_contains') return name.includes(pattern);
  if (matchType === 'shop') return shop === pattern;
  if (matchType === 'shop_prefix') return shop.startsWith(pattern);
  return false;
}

export const MATCH_TYPE_LABEL: Record<string, string> = {
  name_contains: '作業名称に次を含む',
  shop: 'Shopが次と一致',
  shop_prefix: 'Shopが次で始まる',
};

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
