// 部品詳細の後続SHOP混雑（純関数・DB非依存）。
// 全社ヒートマップとは別に、この部品がこれから通る工程だけを並べる。
import type { Color, CongestionLevel, PartCongestion, PartCongestionBatting, PartCongestionStep } from '../shared/types';
import { dayIndex } from './heatmap.logic';

export const CONGESTION_YELLOW = 30;
export const CONGESTION_RED = 50;
export const BATTING_LIMIT = 4;

export interface CongestionStepInput {
  shop: string;
  name: string;
}

export interface CongestionPartInput {
  osId: string;
  shop: string;
  color: Color;
  buffer: number;
  daysLeft: number;
  partNo: string;
  name: string;
  planStart?: Date | null;
  planEnd?: Date | null;
}

export function congestionLevel(count: number, yellowAt = CONGESTION_YELLOW, redAt = CONGESTION_RED): CongestionLevel {
  if (count >= redAt) return 'red';
  if (count >= yellowAt) return 'yellow';
  return 'green';
}

export function colorPct(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((n / total) * 100);
}

function instOf(osId: string): string {
  return osId.replace(/\D/g, '').slice(-4);
}

function toBatting(p: CongestionPartInput): PartCongestionBatting {
  return {
    id: p.osId,
    partNo: p.partNo,
    inst: instOf(p.osId),
    name: p.name,
    color: p.color,
    buffer: p.buffer,
    daysLeft: p.daysLeft,
  };
}

function earlier(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a <= b ? a : b;
}

function later(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a >= b ? a : b;
}

/** 着手〜完了。片方しか無いときはその1日。どちらも無いときは null */
export function planSpan(start?: Date | null, end?: Date | null): [number, number] | null {
  const a = start ?? end;
  const b = end ?? start;
  if (!a || !b) return null;
  const i = dayIndex(a);
  const j = dayIndex(b);
  return i <= j ? [i, j] : [j, i];
}

/** 1日でも重なれば true。日付が欠けている側はバッティングにしない */
export function plansOverlap(
  a: Pick<CongestionPartInput, 'planStart' | 'planEnd'>,
  b: Pick<CongestionPartInput, 'planStart' | 'planEnd'>,
): boolean {
  const sa = planSpan(a.planStart, a.planEnd);
  const sb = planSpan(b.planStart, b.planEnd);
  if (!sa || !sb) return false;
  return sa[0] <= sb[1] && sb[0] <= sa[1];
}

/** 納期までの残日数が多い順（後ろに回しやすい部品が上） */
export function sortBatting(parts: CongestionPartInput[]): CongestionPartInput[] {
  return [...parts].sort((a, b) => b.daysLeft - a.daysLeft || b.buffer - a.buffer || a.osId.localeCompare(b.osId));
}

export function buildPartCongestion(input: {
  osId: string;
  steps: CongestionStepInput[];
  parts: CongestionPartInput[];
  yellowAt?: number;
  redAt?: number;
  battingLimit?: number;
}): PartCongestion {
  const yellowAt = input.yellowAt ?? CONGESTION_YELLOW;
  const redAt = input.redAt ?? CONGESTION_RED;
  const battingLimit = input.battingLimit ?? BATTING_LIMIT;

  const byShop = new Map<string, Map<string, CongestionPartInput>>();
  for (const p of input.parts) {
    if (!p.shop) continue;
    let m = byShop.get(p.shop);
    if (!m) {
      m = new Map();
      byShop.set(p.shop, m);
    }
    const cur = m.get(p.osId);
    if (!cur) {
      m.set(p.osId, { ...p });
      continue;
    }
    cur.planStart = earlier(cur.planStart, p.planStart);
    cur.planEnd = later(cur.planEnd, p.planEnd);
  }

  const seen = new Set<string>();
  const steps: PartCongestionStep[] = [];
  for (const s of input.steps) {
    if (!s.shop || seen.has(s.shop)) continue;
    seen.add(s.shop);
    const all = [...(byShop.get(s.shop)?.values() ?? [])];
    const started = all.length;
    const red = all.filter((p) => p.color === 'red').length;
    const yellow = all.filter((p) => p.color === 'yellow').length;
    const green = started - red - yellow;
    const self = all.find((p) => p.osId === input.osId);
    const others = sortBatting(
      all.filter((p) => p.osId !== input.osId && self != null && plansOverlap(self, p)),
    );
    const batting = others.slice(0, battingLimit).map(toBatting);
    const battingMore = Math.max(0, others.length - batting.length);

    steps.push({
      step: steps.length + 1,
      shop: s.shop,
      name: s.name || `Shop ${s.shop}`,
      started,
      red,
      yellow,
      green,
      redPct: colorPct(red, started),
      yellowPct: colorPct(yellow, started),
      greenPct: colorPct(green, started),
      level: congestionLevel(started, yellowAt, redAt),
      batting,
      battingMore,
    });
  }

  return { osId: input.osId, thresholds: { yellow: yellowAt, red: redAt }, steps };
}
