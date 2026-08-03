import type { Part } from '../../types';
import {
  bufferColor,
  colorCounts,
  matchMilestone,
  classifyPartByRows,
  MATCH_TYPE_LABEL,
} from '@shared/domain';

export type Row = Record<string, unknown>;

export const RECOMPUTE_MASTERS = new Set(['param', 'kishu_due_priority', 'milestone', 'shop_lt', 'calendar', 'category']);
export const LAST_RECOMPUTE_KEY = 'masters.lastRecomputeAt';

export { bufferColor, colorCounts, matchMilestone, MATCH_TYPE_LABEL };

/** 完成品分類ルールを部品番号に適用 */
export function classifyPart(partNo: string, rules: Row[]): string {
  return classifyPartByRows(
    partNo,
    rules.map((r) => ({
      pattern: String(r.pattern ?? ''),
      category: String(r.category ?? ''),
      priority: Number(r.priority ?? 0),
      active: r.active as boolean | string | undefined,
    })),
  );
}

export function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function str(v: unknown): string {
  return v == null ? '' : String(v);
}

export function isActive(row: Row): boolean {
  return row.active === true || row.active === 'true';
}

export function loadLastRecompute(): string | null {
  return sessionStorage.getItem(LAST_RECOMPUTE_KEY);
}

export function saveLastRecompute(iso: string) {
  sessionStorage.setItem(LAST_RECOMPUTE_KEY, iso);
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
