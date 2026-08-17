// 部品詳細の後続SHOP混雑（純関数・DB非依存）。
// 全社ヒートマップとは別に、この部品がこれから通る工程だけを並べる。
import type { Color, CongestionLevel, PartCongestion, PartCongestionBatting, PartCongestionStep } from '../shared/types';

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
  partNo: string;
  name: string;
}

const COLOR_RANK: Record<Color, number> = { red: 0, yellow: 1, green: 2 };

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
  };
}

/** 赤 → 黄 → 緑、同色ならバッファが小さい順 */
export function sortBatting(parts: CongestionPartInput[]): CongestionPartInput[] {
  return [...parts].sort(
    (a, b) => COLOR_RANK[a.color] - COLOR_RANK[b.color] || a.buffer - b.buffer || a.osId.localeCompare(b.osId),
  );
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
    if (!m.has(p.osId)) m.set(p.osId, p);
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
    const others = sortBatting(all.filter((p) => p.osId !== input.osId));
    const batting = others.slice(0, battingLimit).map(toBatting);
    const battingRedMore = Math.max(0, others.filter((p) => p.color === 'red').length - batting.filter((p) => p.color === 'red').length);

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
      battingRedMore,
    });
  }

  return { osId: input.osId, thresholds: { yellow: yellowAt, red: redAt }, steps };
}
