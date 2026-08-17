// /api/heatmap のクエリ解析。不正値は既定へ丸め、範囲外はエラーにする。
import { BadRequestException } from '@nestjs/common';
import type { Color, HeatGroupBy, HeatMode, HeatUnit } from '../shared/types';

export const MAX_BUCKETS = { week: 26, day: 60 } as const;

export interface HeatFilters {
  kishu?: string;
  category?: string;
  owner?: string;
  color?: Color;
}

export interface HeatmapQuery extends HeatFilters {
  mode: HeatMode;
  unit: HeatUnit;
  groupBy: HeatGroupBy;
  count: number;
}

export interface HeatCellQuery extends HeatFilters {
  mode: HeatMode;
  groupBy: HeatGroupBy;
  shop: string;
  job?: string;
  from: string;
  to: string;
}

type Raw = Record<string, string | undefined>;

const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

const trimmed = (v: string | undefined): string | undefined => {
  const s = v?.trim();
  return s ? s : undefined;
};

function parseFilters(q: Raw): HeatFilters {
  return {
    kishu: trimmed(q.kishu),
    category: trimmed(q.category),
    owner: trimmed(q.owner),
    color: q.color === 'red' || q.color === 'yellow' || q.color === 'green' ? q.color : undefined,
  };
}

export function parseHeatmapQuery(q: Raw, defaultWeeks: number): HeatmapQuery {
  const unit = oneOf(q.unit, ['week', 'day'] as const, 'week');
  const max = MAX_BUCKETS[unit];
  const fallback = unit === 'week' ? defaultWeeks : 21;
  const raw = q.count ? Number(q.count) : fallback;
  if (!Number.isFinite(raw)) throw new BadRequestException('count は数値で指定してください');
  const count = Math.min(Math.max(Math.trunc(raw), 1), max);
  return {
    mode: oneOf(q.mode, ['arrival', 'occupancy'] as const, 'arrival'),
    unit,
    groupBy: oneOf(q.groupBy, ['shop', 'job', 'part'] as const, 'shop'),
    count,
    ...parseFilters(q),
  };
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 形式だけでなく実在する日付かも見る（2026-13-01 を弾く） */
function isYmd(s: string | undefined): s is string {
  const m = s?.match(YMD);
  if (!m) return false;
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(y, mo - 1, day);
  return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day;
}

export function parseHeatCellQuery(q: Raw): HeatCellQuery {
  const shop = trimmed(q.shop);
  if (!shop) throw new BadRequestException('shop は必須です');
  const from = trimmed(q.from);
  const to = trimmed(q.to);
  if (!isYmd(from)) throw new BadRequestException('from は YYYY-MM-DD で指定してください');
  if (!isYmd(to)) throw new BadRequestException('to は YYYY-MM-DD で指定してください');
  if (from > to) throw new BadRequestException('from は to 以前にしてください');
  const groupBy = oneOf(q.groupBy, ['shop', 'job'] as const, 'shop');
  const job = trimmed(q.job);
  if (groupBy === 'job' && !job) throw new BadRequestException('groupBy=job のときは job が必要です');
  return {
    mode: oneOf(q.mode, ['arrival', 'occupancy'] as const, 'arrival'),
    groupBy,
    shop,
    job: groupBy === 'job' ? job : undefined,
    from,
    to,
    ...parseFilters(q),
  };
}
