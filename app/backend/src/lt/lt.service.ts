// 実績リードタイム集計。t_routing の JND(実績) から SHOP 別の所要日数を求め、
// t_shop_lt_stat に保存する。m_shop_lt（手入力の標準LT）は上書きせず「推奨値」として出す。
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildNameResolver } from '../etl/etl-shop-master.util';
import type { LtMode, LtPercentile, LtStatRow, LtStatsResult } from '../shared/types';
import {
  aggregateShopLt,
  collectLtSamples,
  LT_PERCENTILE_KEYS,
  recommendLtDays,
  type LtRoutingRow,
  type LtSample,
  type ShopLtStatRow,
} from './lt.logic';

const DEFAULT_MAX_DAYS = 365;
const DEFAULT_MIN_SAMPLES = 10;
const DEFAULT_SHOP_LT = 4;

export interface LtSettings {
  mode: LtMode;
  percentile: LtPercentile;
  minSamples: number;
  maxDays: number;
  defaultLt: number;
}

@Injectable()
export class LtService {
  private readonly logger = new Logger('LT');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 実績LTを集計し直して t_shop_lt_stat を作り替える */
  async recompute(): Promise<{ shops: number; samples: number }> {
    const t0 = Date.now();
    const [settings, holidays, rows] = await Promise.all([
      this.loadSettings(),
      this.loadHolidays(),
      this.prisma.routing.findMany({
        where: { shop: { not: null } },
        select: { osId: true, seq: true, shop: true, actualEnd: true, hs: true },
        orderBy: [{ osId: 'asc' }, { seq: 'asc' }],
      }),
    ]);

    const byOs = new Map<string, LtRoutingRow[]>();
    const hsByShop = new Map<string, number[]>();
    for (const r of rows) {
      const shop = r.shop ?? '';
      const row: LtRoutingRow = {
        osId: r.osId,
        seq: r.seq,
        shop,
        actualEnd: r.actualEnd,
        hs: r.hs == null ? null : Number(r.hs),
      };
      let arr = byOs.get(r.osId);
      if (!arr) {
        arr = [];
        byOs.set(r.osId, arr);
      }
      arr.push(row);
      if (row.hs != null) {
        let hs = hsByShop.get(shop);
        if (!hs) {
          hs = [];
          hsByShop.set(shop, hs);
        }
        hs.push(row.hs);
      }
    }

    const samples: LtSample[] = [];
    for (const partRows of byOs.values()) {
      for (const s of collectLtSamples(partRows, { maxDays: settings.maxDays, holidays })) samples.push(s);
    }
    const stats = aggregateShopLt(samples, hsByShop);

    const computedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.shopLtStat.deleteMany();
      if (stats.length > 0) {
        await tx.shopLtStat.createMany({ data: stats.map((s) => ({ ...s, computedAt })) });
      }
    });

    this.logger.log(`実績LT集計: SHOP=${stats.length} サンプル=${samples.length} (${Date.now() - t0}ms)`);
    return { shops: stats.length, samples: samples.length };
  }

  async getStats(): Promise<LtStatsResult> {
    const [settings, stats, manual, resolveName] = await Promise.all([
      this.loadSettings(),
      this.loadStats(),
      this.loadManualLt(),
      this.buildNameResolver(),
    ]);

    const shops = new Set<string>([...stats.map((s) => s.shop), ...manual.keys()]);
    const statByShop = new Map(stats.map((s) => [s.shop, s]));

    const rows: LtStatRow[] = [...shops].map((shop) => {
      const st = statByShop.get(shop);
      const manualLt = manual.get(shop) ?? null;
      const recommended = st ? recommendLtDays(st, settings.percentile, settings.minSamples) : null;
      const { effective, source } = resolveEffective(settings, manualLt, recommended);
      return {
        shop,
        name: resolveName(shop, ''),
        n: st?.n ?? 0,
        p50: st?.p50 ?? 0,
        p75: st?.p75 ?? 0,
        p90: st?.p90 ?? 0,
        mean: st?.mean ?? 0,
        hsMedian: st?.hsMedian ?? null,
        manualLt,
        recommended,
        effective,
        source,
      };
    });
    rows.sort((a, b) => b.n - a.n || a.shop.localeCompare(b.shop));

    const samples = stats.reduce((s, x) => s + x.n, 0);
    return {
      computedAt: (await this.loadComputedAt())?.toISOString() ?? null,
      mode: settings.mode,
      percentile: settings.percentile,
      minSamples: settings.minSamples,
      defaultLt: settings.defaultLt,
      summary: {
        shops: stats.length,
        samples,
        ...overDefault(stats, settings.defaultLt),
      },
      rows,
    };
  }

  /**
   * 推奨値を m_shop_lt に書き込む。shops 未指定なら推奨値を持つ全 SHOP。
   * LT_MODE=actual は「集計値を自動で使う」設定だが、こちらは明示的にマスタへ確定させる操作。
   * 監査ログに残るので、いつ誰がどの値を採用したか追える。
   */
  async adopt(user: string, shops?: string[]): Promise<{ updated: number }> {
    const [settings, stats, manual] = await Promise.all([
      this.loadSettings(),
      this.loadStats(),
      this.loadManualLt(),
    ]);
    const target = new Set(shops ?? stats.map((s) => s.shop));
    let updated = 0;
    for (const st of stats) {
      if (!target.has(st.shop)) continue;
      const rec = recommendLtDays(st, settings.percentile, settings.minSamples);
      if (rec == null) continue;
      const before = manual.get(st.shop) ?? null;
      if (before === rec) continue;
      await this.prisma.shopLt.upsert({
        where: { shop: st.shop },
        create: { shop: st.shop, ltDays: rec, active: true, createdBy: user, updatedBy: user },
        update: { ltDays: rec, active: true, updatedBy: user, updatedAt: new Date() },
      });
      await this.audit.record(user, 'lt.adopt', 'm_shop_lt', st.shop, { ltDays: before }, {
        ltDays: rec,
        percentile: settings.percentile,
        n: st.n,
      });
      updated++;
    }
    return { updated };
  }

  async loadSettings(): Promise<LtSettings> {
    const rows = await this.prisma.param.findMany({
      where: { key: { in: ['LT_MODE', 'LT_ACTUAL_PERCENTILE', 'LT_MIN_SAMPLES', 'LT_ACTUAL_MAX_DAYS', 'SHOP_LT_DAYS'] } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const num = (key: string, fallback: number): number => {
      const v = Number(map.get(key));
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };
    const pct = map.get('LT_ACTUAL_PERCENTILE');
    return {
      mode: map.get('LT_MODE') === 'actual' ? 'actual' : 'fixed',
      percentile: LT_PERCENTILE_KEYS.includes(pct as LtPercentile) ? (pct as LtPercentile) : 'p50',
      minSamples: num('LT_MIN_SAMPLES', DEFAULT_MIN_SAMPLES),
      maxDays: num('LT_ACTUAL_MAX_DAYS', DEFAULT_MAX_DAYS),
      defaultLt: num('SHOP_LT_DAYS', DEFAULT_SHOP_LT),
    };
  }

  async loadStats(): Promise<ShopLtStatRow[]> {
    const rows = await this.prisma.shopLtStat.findMany();
    return rows.map((r) => ({
      shop: r.shop,
      n: r.n,
      p50: Number(r.p50),
      p75: Number(r.p75),
      p90: Number(r.p90),
      mean: Number(r.mean),
      hsMedian: r.hsMedian == null ? null : Number(r.hsMedian),
    }));
  }

  private async loadComputedAt(): Promise<Date | null> {
    const row = await this.prisma.shopLtStat.findFirst({ select: { computedAt: true } });
    return row?.computedAt ?? null;
  }

  /** 休日集合。バッファ計算の残日数と単位を揃えるため実績LTも稼働日で数える */
  private async loadHolidays(): Promise<Set<string>> {
    const rows = await this.prisma.calendar.findMany({
      where: { isWorkday: false },
      select: { calDate: true },
    });
    return new Set(
      rows.map((r) => {
        const d = r.calDate;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }),
    );
  }

  private async loadManualLt(): Promise<Map<string, number>> {
    const rows = await this.prisma.shopLt.findMany({
      where: { active: true },
      select: { shop: true, ltDays: true },
    });
    return new Map(rows.map((r) => [r.shop, Number(r.ltDays)]));
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
}

/** 手入力 > 実績（actualモードのみ） > 既定LT の順で決まる。masters.util の組み立てと同じ順序 */
function resolveEffective(
  settings: LtSettings,
  manualLt: number | null,
  recommended: number | null,
): { effective: number; source: LtStatRow['source'] } {
  if (manualLt != null) return { effective: manualLt, source: 'manual' };
  if (settings.mode === 'actual' && recommended != null) return { effective: recommended, source: 'actual' };
  return { effective: settings.defaultLt, source: 'default' };
}

/** 「既定LTでは足りない SHOP」がどれだけあるか。実績中央値が既定LTを超えるものを数える */
function overDefault(
  stats: ShopLtStatRow[],
  defaultLt: number,
): { overDefaultShops: number; overDefaultSamplePct: number } {
  const total = stats.reduce((s, x) => s + x.n, 0);
  const over = stats.filter((s) => s.p50 > defaultLt);
  const overSamples = over.reduce((s, x) => s + x.n, 0);
  return {
    overDefaultShops: over.length,
    overDefaultSamplePct: total === 0 ? 0 : Math.round((overSamples / total) * 1000) / 10,
  };
}
