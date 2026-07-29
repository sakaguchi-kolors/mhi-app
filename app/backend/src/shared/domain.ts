import type { Color } from './types';

/** バッファ→色（2.3）。既定: 1以上=緑 / 0=黄 / マイナス=赤 */
export function bufferColor(buffer: number, green = 1, yellow = 0): Color {
  if (buffer >= green) return 'green';
  if (buffer >= yellow) return 'yellow';
  return 'red';
}

export function matchMilestone(matchType: string, pattern: string, shop: string, name: string): boolean {
  if (!pattern) return false;
  if (matchType === 'name_contains') return name.includes(pattern);
  if (matchType === 'shop') return shop === pattern;
  if (matchType === 'shop_prefix') return shop.startsWith(pattern);
  return false;
}

export interface CompiledCategoryRule {
  re: RegExp;
  category: string;
}

export interface PatternCategoryRule {
  pattern: string;
  category: string;
  priority?: number;
  active?: boolean | string;
}

function normalizePartNo(partNo: string): string {
  return partNo.trim().toUpperCase();
}

/** バックエンド ETL / 再計算用（コンパイル済み正規表現） */
export function classifyPartByRegex(partNo: string, rules: CompiledCategoryRule[]): string {
  const p = normalizePartNo(partNo);
  for (const r of rules) if (r.re.test(p)) return r.category;
  return 'その他';
}

/** フロントマスタ編集プレビュー用（生のマスタ行） */
export function classifyPartByRows(partNo: string, rules: PatternCategoryRule[]): string {
  const sorted = [...rules]
    .filter((r) => r.active === true || r.active === 'true')
    .sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0));
  for (const r of sorted) {
    const pattern = String(r.pattern ?? '').trim();
    if (!pattern) continue;
    try {
      if (new RegExp(pattern).test(partNo)) return String(r.category ?? '');
    } catch {
      /* 不正な正規表現はスキップ */
    }
  }
  return 'その他';
}

export function colorCounts(
  parts: { buffer: number; color: Color }[],
  green?: number,
  yellow?: number,
): Record<Color, number> {
  const out: Record<Color, number> = { green: 0, yellow: 0, red: 0 };
  for (const p of parts) {
    const c = green != null && yellow != null ? bufferColor(p.buffer, green, yellow) : p.color;
    out[c] += 1;
  }
  return out;
}

export const MATCH_TYPE_LABEL: Record<string, string> = {
  name_contains: '作業名称に次を含む',
  shop: 'Shopが次と一致',
  shop_prefix: 'Shopが次で始まる',
};
