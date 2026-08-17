// 工程ヒートマップ：t_routing の未完了工程を時間バケットに積み上げる。
// ②算出結果の再計算は不要で、取込済みデータからオンデマンドに集計する。
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AsOfService } from '../config/as-of.service';
import { buildNameResolver } from '../etl/etl-shop-master.util';
import { mmdd } from '../shared/dates';
import type { Color, HeatCellDetail, HeatCellPart, HeatThresholds, HeatmapResult, PartCongestion } from '../shared/types';
import { buildPartCongestion } from './part-congestion.logic';
import {
  aggregateHeatmap,
  buildBuckets,
  dayIndex,
  heatRowKey,
  rowsInRange,
  type HeatPartInput,
  type HeatRoutingInput,
} from './heatmap.logic';
import type { HeatCellQuery, HeatFilters, HeatmapQuery } from './heatmap.query';

const CELL_PART_LIMIT = 300;
const SHOP_ROW_LIMIT = 400;
const PART_ROW_LIMIT = 200;

const DEFAULT_THRESHOLDS: HeatThresholds = {
  warn: 1.2,
  alert: 1.5,
  crit: 2,
  minCount: 3,
  absWarn: 0,
  absAlert: 0,
  absCrit: 0,
};
const DEFAULT_WEEKS = 12;

const PARAM_KEYS = [
  'HEAT_LEVEL_WARN',
  'HEAT_LEVEL_ALERT',
  'HEAT_LEVEL_CRIT',
  'HEAT_MIN_COUNT',
  'HEAT_ABS_WARN',
  'HEAT_ABS_ALERT',
  'HEAT_ABS_CRIT',
  'HEAT_WEEKS',
];

type StatusRow = {
  osId: string;
  partNo: string | null;
  partName: string | null;
  kishu: string | null;
  category: string | null;
  color: string | null;
  buffer: number | null;
  daysLeft: number | null;
  stagnantDays: number | null;
  urgent: boolean | null;
  shortage: boolean | null;
};

@Injectable()
export class HeatmapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asOf: AsOfService,
  ) {}

  async getHeatmap(q: HeatmapQuery): Promise<HeatmapResult> {
    const asOfDate = await this.asOf.getEffectiveDate();
    const { thresholds, defaultWeeks } = await this.loadParams();
    const buckets = buildBuckets(asOfDate, q.unit, q.count || defaultWeeks);
    const winFrom = new Date(`${buckets[0].from}T00:00:00`);
    const winTo = new Date(`${buckets[buckets.length - 1].to}T23:59:59.999`);

    const [status, routing, resolveName, ownerByOs] = await Promise.all([
      this.loadStatus(),
      this.loadRouting({ winFrom, winTo }),
      this.buildNameResolver(),
      this.loadOwners(q.owner ? true : false),
    ]);

    const statusMap = new Map(status.map((s) => [s.osId, s]));
    const allow = buildAllowFilter(q, statusMap, ownerByOs);
    const rows = allow ? routing.filter((r) => allow(r.osId)) : routing;

    const partOf = (osId: string): HeatPartInput | undefined => {
      const s = statusMap.get(osId);
      if (!s) return undefined;
      return {
        color: toColor(s.color),
        stagnant: s.stagnantDays ?? 0,
        partNo: s.partNo ?? '',
        name: s.partName ?? '',
        inst: osId.replace(/\D/g, '').slice(-4),
      };
    };

    const all = aggregateHeatmap({ rows, buckets, mode: q.mode, groupBy: q.groupBy, thresholds, partOf, resolveName });
    // 部品単位は 2 万行を超えうるので、優先度の高いものだけ返す
    const limit = q.groupBy === 'part' ? PART_ROW_LIMIT : SHOP_ROW_LIMIT;

    return {
      asOf: await this.asOf.getEffective(),
      mode: q.mode,
      unit: q.unit,
      groupBy: q.groupBy,
      thresholds,
      buckets: buckets.map(({ from, to, label }) => ({ from, to, label })),
      rows: all.slice(0, limit),
      totalRows: all.length,
      kishus: distinct(status.map((s) => s.kishu)),
      categories: distinct(status.map((s) => s.category)),
    };
  }

  async getCell(q: HeatCellQuery): Promise<HeatCellDetail> {
    const fromIdx = dayIndex(new Date(`${q.from}T00:00:00`));
    const toIdx = dayIndex(new Date(`${q.to}T00:00:00`));

    const [status, routing, resolveName, ownerByOs] = await Promise.all([
      this.loadStatus(),
      this.loadRouting({
        winFrom: new Date(`${q.from}T00:00:00`),
        winTo: new Date(`${q.to}T23:59:59.999`),
        shop: q.shop,
        job: q.job,
        includeWip: false,
      }),
      this.buildNameResolver(),
      this.loadOwners(true),
    ]);

    const statusMap = new Map(status.map((s) => [s.osId, s]));
    const allow = buildAllowFilter(q, statusMap, ownerByOs);
    const target = routing.filter(
      (r) => heatRowKey(r.shop, r.job, q.groupBy) === heatRowKey(q.shop, q.job ?? '', q.groupBy),
    );
    const inRange = rowsInRange(allow ? target.filter((r) => allow(r.osId)) : target, q.mode, fromIdx, toIdx);

    // 同一部品が同じ工程を複数行に分けて持つことがあるので、着手は最早・完了は最遅に寄せる
    const spanByOs = new Map<string, { start: Date | null; end: Date | null }>();
    for (const r of inRange) {
      const cur = spanByOs.get(r.osId) ?? { start: null, end: null };
      if (r.planStart && (!cur.start || r.planStart < cur.start)) cur.start = r.planStart;
      if (r.planEnd && (!cur.end || r.planEnd > cur.end)) cur.end = r.planEnd;
      spanByOs.set(r.osId, cur);
    }

    const parts: HeatCellPart[] = [...spanByOs]
      .map(([osId, span]) => {
        const s = statusMap.get(osId);
        return {
          id: osId,
          partNo: s?.partNo ?? '',
          inst: osId.replace(/\D/g, '').slice(-4),
          name: s?.partName ?? '',
          kishu: s?.kishu ?? '',
          color: toColor(s?.color),
          buffer: s?.buffer ?? 0,
          daysLeft: s?.daysLeft ?? 0,
          planStart: mmdd(span.start),
          planEnd: mmdd(span.end),
          owner: ownerByOs.get(osId) ?? '未割当',
          urgent: s?.urgent ?? false,
          shortage: s?.shortage ?? false,
          trouble: false,
        };
      })
      .sort((a, b) => a.buffer - b.buffer || a.daysLeft - b.daysLeft || a.id.localeCompare(b.id));

    const troubled = await this.prisma.trouble.findMany({
      where: { flagged: true, osId: { in: parts.slice(0, CELL_PART_LIMIT).map((p) => p.id) } },
      select: { osId: true },
    });
    const troubleSet = new Set(troubled.map((t) => t.osId));

    return {
      shop: q.shop,
      job: q.job,
      name: resolveName(q.shop, q.job ?? ''),
      from: q.from,
      to: q.to,
      total: parts.length,
      parts: parts.slice(0, CELL_PART_LIMIT).map((p) => ({ ...p, trouble: troubleSet.has(p.id) })),
    };
  }

  /** 部品詳細：これから通る SHOP の着手数・色内訳・バッティング候補 */
  async getPartCongestion(osId: string): Promise<PartCongestion> {
    const exists = await this.prisma.partStatus.findUnique({ where: { osId }, select: { osId: true } });
    if (!exists) throw new NotFoundException(`部品 ${osId} が見つかりません`);

    const timeline = await this.prisma.timeline.findMany({
      where: { osId, NOT: { status: 'done' } },
      orderBy: { seq: 'asc' },
      select: { shop: true, name: true },
    });
    const steps = timeline
      .filter((t) => t.shop)
      .map((t) => ({ shop: t.shop ?? '', name: t.name ?? '' }));
    const shops = [...new Set(steps.map((s) => s.shop))];

    if (!shops.length) return buildPartCongestion({ osId, steps: [], parts: [] });

    const routing = await this.prisma.routing.findMany({
      where: { shop: { in: shops }, actualEnd: null },
        select: { osId: true, shop: true, planStart: true, planEnd: true },
    });
    const osIds = [...new Set(routing.map((r) => r.osId))];
    const status = osIds.length
      ? await this.prisma.partStatus.findMany({
          where: { osId: { in: osIds } },
          select: { osId: true, partNo: true, partName: true, color: true, buffer: true, daysLeft: true },
        })
      : [];
    const statusMap = new Map(status.map((s) => [s.osId, s]));

    return buildPartCongestion({
      osId,
      steps,
      parts: routing.map((r) => {
        const s = statusMap.get(r.osId);
        return {
          osId: r.osId,
          shop: r.shop ?? '',
          color: toColor(s?.color),
          buffer: s?.buffer ?? 0,
          daysLeft: s?.daysLeft ?? 0,
          partNo: s?.partNo ?? '',
          name: s?.partName ?? '',
          planStart: r.planStart,
          planEnd: r.planEnd,
        };
      }),
    });
  }

  private async loadParams(): Promise<{ thresholds: HeatThresholds; defaultWeeks: number }> {
    const rows = await this.prisma.param.findMany({
      where: { key: { in: PARAM_KEYS } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const num = (key: string, fallback: number): number => {
      const v = Number(map.get(key));
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };
    // 絶対件数の閾値は 0（＝使わない）を有効な設定として受け付ける
    const absNum = (key: string): number => {
      const v = Number(map.get(key));
      return Number.isFinite(v) && v >= 0 ? v : 0;
    };
    return {
      thresholds: {
        warn: num('HEAT_LEVEL_WARN', DEFAULT_THRESHOLDS.warn),
        alert: num('HEAT_LEVEL_ALERT', DEFAULT_THRESHOLDS.alert),
        crit: num('HEAT_LEVEL_CRIT', DEFAULT_THRESHOLDS.crit),
        minCount: num('HEAT_MIN_COUNT', DEFAULT_THRESHOLDS.minCount),
        absWarn: absNum('HEAT_ABS_WARN'),
        absAlert: absNum('HEAT_ABS_ALERT'),
        absCrit: absNum('HEAT_ABS_CRIT'),
      },
      defaultWeeks: num('HEAT_WEEKS', DEFAULT_WEEKS),
    };
  }

  private loadStatus(): Promise<StatusRow[]> {
    return this.prisma.partStatus.findMany({
      select: {
        osId: true,
        partNo: true,
        partName: true,
        kishu: true,
        category: true,
        color: true,
        buffer: true,
        daysLeft: true,
        stagnantDays: true,
        urgent: true,
        shortage: true,
      },
    });
  }

  /** 未完了工程のうち、表示期間に掛かる行（＋現在仕掛中の行）だけを取る */
  private async loadRouting(opts: {
    winFrom: Date;
    winTo: Date;
    shop?: string;
    job?: string;
    includeWip?: boolean;
  }): Promise<HeatRoutingInput[]> {
    const { winFrom, winTo, shop, job, includeWip = true } = opts;
    const overlaps = [
      { planStart: { gte: winFrom, lte: winTo } },
      { planEnd: { gte: winFrom, lte: winTo } },
      { AND: [{ planStart: { lte: winFrom } }, { planEnd: { gte: winTo } }] },
    ];
    const rows = await this.prisma.routing.findMany({
      where: {
        actualEnd: null,
        shop: { not: null },
        ...(shop ? { shop } : {}),
        ...(job ? { job } : {}),
        OR: includeWip ? [{ wipFlag: true }, ...overlaps] : overlaps,
      },
      select: { osId: true, shop: true, job: true, planStart: true, planEnd: true, wipFlag: true },
    });
    return rows.map((r) => ({
      osId: r.osId,
      shop: r.shop ?? '',
      job: r.job ?? '',
      planStart: r.planStart,
      planEnd: r.planEnd,
      wip: r.wipFlag,
    }));
  }

  private async buildNameResolver(): Promise<(shop: string, job: string) => string> {
    const [master, shopName] = await Promise.all([
      this.prisma.shopMaster.findMany({ select: { shop: true, job: true, name: true } }),
      this.prisma.shopName.findMany({ select: { shop: true, name: true } }),
    ]);
    const byShopJob = new Map<string, string>();
    const byShop = new Map<string, string>();
    for (const r of master) {
      if (!r.shop || !r.name) continue;
      byShopJob.set(`${r.shop}::${r.job}`, r.name);
      if (!byShop.has(r.shop)) byShop.set(r.shop, r.name);
    }
    const octName = new Map<string, string>();
    for (const r of shopName) if (r.shop && r.name) octName.set(r.shop, r.name);
    return buildNameResolver(byShopJob, byShop, octName);
  }

  private async loadOwners(needed: boolean): Promise<Map<string, string>> {
    if (!needed) return new Map();
    const rows = await this.prisma.assignment.findMany({
      select: { osId: true, user: { select: { displayName: true } } },
    });
    return new Map(rows.filter((r) => r.user).map((r) => [r.osId, r.user!.displayName]));
  }
}

function toColor(c: string | null | undefined): Color {
  return c === 'red' || c === 'yellow' ? c : 'green';
}

function distinct(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}

/** 絞り込み条件がひとつも無ければ null を返し、呼び出し側でフィルタ自体を省く */
function buildAllowFilter(
  f: HeatFilters,
  statusMap: Map<string, StatusRow>,
  ownerByOs: Map<string, string>,
): ((osId: string) => boolean) | null {
  if (!f.kishu && !f.category && !f.owner && !f.color) return null;
  return (osId: string): boolean => {
    const s = statusMap.get(osId);
    if (!s) return false;
    if (f.kishu && s.kishu !== f.kishu) return false;
    if (f.category && s.category !== f.category) return false;
    if (f.color && toColor(s.color) !== f.color) return false;
    if (f.owner && (ownerByOs.get(osId) ?? '未割当') !== f.owner) return false;
    return true;
  };
}
