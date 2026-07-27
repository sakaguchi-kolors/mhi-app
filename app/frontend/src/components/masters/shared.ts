import type { Color, Part } from '../../types';

export type Row = Record<string, unknown>;

export const RECOMPUTE_MASTERS = new Set(['param', 'milestone', 'shop_lt', 'calendar', 'category']);
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

/** 完成品分類ルールを部品番号に適用 */
export function classifyPart(partNo: string, rules: Row[]): string {
  const sorted = [...rules]
    .filter((r) => r.active === true || r.active === 'true')
    .sort((a, b) => num(a.priority) - num(b.priority));
  for (const r of sorted) {
    const pattern = str(r.pattern);
    if (!pattern) continue;
    try {
      if (new RegExp(pattern).test(partNo)) return str(r.category);
    } catch {
      /* 不正な正規表現はスキップ */
    }
  }
  return 'その他';
}

/** 部品のタイムラインに Shop が含まれるか（未完了工程） */
export function partUsesShop(part: Part, shop: string): boolean {
  if (part.currentShop === shop) return true;
  return part.timeline.some((c) => c.shop === shop && c.status !== 'done');
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
