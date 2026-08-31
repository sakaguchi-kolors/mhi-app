// ETL＋算出バッチ：CSV(CP932/UTF-8) → 取込 → 算出 → PostgreSQL
import { ConflictException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { AsOfService } from '../config/as-of.service';
import { readCsv, readCsvStream, clean } from './csv';
import { computePart, type PartMeta } from '../calc/calc';
import { loadMasters } from '../masters/masters.util';
import { AuditService } from '../audit/audit.service';
import type { RoutingRow } from './etl-routing.types';
import type { Agg, EtlSummary, ShopMasterRow } from './etl-types';
import { parseDateTime, parsePbsMonthEnd, parseSeq } from './etl-dates';
import { batchInsert } from './etl-batch';
import { deriveCategory } from './etl-category';
import {
  aggregateColorCounts,
  buildCalcOpts,
  buildStatusTimelineRows,
  flexMaxFromRows,
  resolveFinalDueForPart,
} from './etl-compute.util';
import {
  buildNameResolver,
  buildOctNameMap,
  buildShopMasterRows,
  collectFlexShopJobs,
  shopMasterEqual,
  shopMasterKey,
  toShopMasterRow,
} from './etl-shop-master.util';
import { BatchLockService } from './batch-lock.service';
import { syncMilestoneArchive } from '../masters/milestone-usage.util';
import { PartsService } from '../parts/parts.service';

@Injectable()
export class EtlService {
  private readonly logger = new Logger('ETL');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly asOf: AsOfService,
    private readonly audit: AuditService,
    private readonly batchLock: BatchLockService,
    @Inject(forwardRef(() => PartsService)) private readonly parts: PartsService,
  ) {}

  /** CSV取込＋算出＋DB洗い替え（①②のみ。③アプリ固有は残す） */
  async runEtl(opts: { dry?: boolean; user?: string } = {}): Promise<EtlSummary> {
    if (!this.batchLock.acquire()) {
      throw new ConflictException('バッチ処理が実行中です');
    }
    try {
      return await this.runEtlInner(opts);
    } finally {
      this.batchLock.release();
    }
  }

  private async runEtlInner(opts: { dry?: boolean; user?: string } = {}): Promise<EtlSummary> {
    const dry = opts.dry ?? false;
    const auditUser = opts.user ?? 'etl';
    const { csvDir, files } = this.config;
    const { ymd: asOfYmd, date: asOf } = this.asOf.forIngest();
    const M = await loadMasters(this.prisma);
    this.logger.log(`CSV_DIR = ${csvDir}`);
    this.logger.log(`AS_OF = ${asOfYmd}`);

    const master = readCsv(csvDir, files.shopMaster);
    const nameByShopJob = new Map<string, string>();
    const nameByShop = new Map<string, string>();
    for (const r of master) {
      const shop = clean(r['SHOP']);
      const job = clean(r['JOB']);
      const name = clean(r['作業名称']);
      if (!shop || !name) continue;
      nameByShopJob.set(`${shop}::${job}`, name);
      if (!nameByShop.has(shop)) nameByShop.set(shop, name);
    }

    const parts = new Map<string, Agg>();
    const t0Flex = Date.now();
    const nFlex = await readCsvStream(csvDir, files.flexsche, (r) => {
      const osId = clean(r['OS_ID']);
      if (!osId) return;
      let agg = parts.get(osId);
      if (!agg) {
        agg = { partNo: clean(r['部品番号']), partName: clean(r['部品名称']), kishu: clean(r['機種']), urgent: false, rows: [] };
        parts.set(osId, agg);
      }
      if (!agg.partNo) agg.partNo = clean(r['部品番号']);
      if (!agg.partName) agg.partName = clean(r['部品名称']);
      if (!agg.kishu) agg.kishu = clean(r['機種']);
      if (clean(r['緊急品']) === '赤紙') agg.urgent = true;
      const seq = parseSeq(r['工程NO']);
      agg.rows.push({
        osId,
        seqMain: seq.main,
        seqSub: seq.sub,
        seqLabel: clean(r['工程NO']),
        shop: clean(r['SHOP']),
        job: clean(r['JOB']),
        planStart: parseDateTime(r['JIW(計算)']),
        planEnd: parseDateTime(r['JND(計算)']),
        actualEnd: parseDateTime(r['JND(実績)']),
        wip: clean(r['仕掛']) === '1',
        materialStatus: clean(r['払出状況']),
        outDate: parseDateTime(r['外注持出日']),
        inDate: parseDateTime(r['外注持込日']),
        etaDate: parseDateTime(r['納入予定日']),
        reqDueDate: parseDateTime(r['希望納期']),
        orderNo: clean(r['注文番号']),
      });
    });
    this.logger.log(`[etl] read flexsche ${Date.now() - t0Flex}ms`);

    const nameFromPbs = new Map<string, string>();
    const dueMonthByOsId = new Map<string, string>();
    const t0Pbs = Date.now();
    const nPbs = await readCsvStream(csvDir, files.pbs, (r) => {
      const osId = clean(r['OS_ID']);
      if (!osId) return;
      if (!nameFromPbs.has(osId)) {
        const nm = clean(r['部品名称']);
        if (nm) nameFromPbs.set(osId, nm);
      }
      if (!dueMonthByOsId.has(osId)) {
        const d = clean(r['計画納期']);
        if (d) dueMonthByOsId.set(osId, d);
      }
    });
    this.logger.log(`[etl] read pbs ${Date.now() - t0Pbs}ms`);

    const octFreq = new Map<string, Map<string, number>>();
    const nameFromOct = new Map<string, string>();
    const octJndByOsId = new Map<string, Date>();
    const t0Oct = Date.now();
    const nOct = await readCsvStream(csvDir, files.octopus, (r) => {
      const shop = clean(r['SHOP']);
      const proc = clean(r['手順内容']);
      if (shop && proc) {
        let m = octFreq.get(shop);
        if (!m) {
          m = new Map();
          octFreq.set(shop, m);
        }
        m.set(proc, (m.get(proc) ?? 0) + 1);
      }
      const osId = clean(r['OS_ID']);
      if (!osId || !parts.has(osId)) return;
      if (!nameFromOct.has(osId)) {
        const nm = clean(r['部品名称']);
        if (nm) nameFromOct.set(osId, nm);
      }
      const jnd = parseDateTime(r['JND(計算)'] ?? r['JND'] ?? '');
      if (!jnd) return;
      const prev = octJndByOsId.get(osId);
      if (!prev || jnd > prev) octJndByOsId.set(osId, jnd);
    });
    this.logger.log(`[etl] read octopus ${Date.now() - t0Oct}ms`);

    const octName = buildOctNameMap(octFreq);
    const resolveName = buildNameResolver(nameByShopJob, nameByShop, octName);

    this.logger.log(`rows: flex=${nFlex} pbs=${nPbs} octopus=${nOct} master=${master.length}`);
    this.logger.log(`部品(OS_ID)数 = ${parts.size}`);

    const buildMeta = (osId: string, agg: Agg): PartMeta => {
      const candidates = {
        flexsche: flexMaxFromRows(agg.rows),
        octopus: octJndByOsId.get(osId) ?? null,
        pbs: parsePbsMonthEnd(dueMonthByOsId.get(osId) ?? ''),
      };
      const finalDue = resolveFinalDueForPart(agg.kishu, candidates, M.kishuDuePriority, M.defaultKishuDuePriority);
      return {
        osId,
        partNo: agg.partNo,
        name: agg.partName || nameFromPbs.get(osId) || nameFromOct.get(osId) || '',
        category: deriveCategory(agg.partNo, M),
        kishu: agg.kishu,
        finalDue,
        urgent: agg.urgent,
        shortage: false,
      };
    };
    const calcOpts = buildCalcOpts(M);
    const computed = [...parts].map(([osId, agg]) => {
      const meta = buildMeta(osId, agg);
      return { osId, agg, meta, part: computePart(meta, agg.rows, resolveName, asOf, calcOpts) };
    });

    if (dry) {
      const by = (c: string) => computed.filter((x) => x.part.color === c).length;
      this.logger.log(`[dry] 色分布  red=${by('red')} yellow=${by('yellow')} green=${by('green')}`);
      this.logger.log(`[dry] 滞留(>=${M.params.stagnantThreshold}日) = ${computed.filter((x) => x.part.stagnant >= M.params.stagnantThreshold).length}`);
      this.logger.log(`[dry] 赤紙 = ${computed.filter((x) => x.part.urgent).length}`);
      this.logger.log(`[dry] 完成品分類 = ${[...new Set(computed.map((x) => x.part.category))].join(', ')}`);
      return { parts: computed.length, timeline: computed.reduce((s, x) => s + x.part.timeline.length, 0) };
    }

    const computedAt = new Date();
    const partRows: unknown[][] = [];
    const routingRows: unknown[][] = [];
    const assignRows: unknown[][] = [];
    for (const { osId, agg, meta } of computed) {
      const finalDue = meta.finalDue;
      const pbsDue = parsePbsMonthEnd(dueMonthByOsId.get(osId) ?? '');
      const octDue = octJndByOsId.get(osId) ?? null;
      partRows.push([osId, meta.partNo, meta.name, meta.category, meta.kishu, finalDue, pbsDue, octDue, meta.urgent, meta.shortage]);
      let seqN = 0;
      for (const rr of [...agg.rows].sort((a, b) => a.seqMain - b.seqMain || a.seqSub - b.seqSub)) {
        seqN++;
        routingRows.push([osId, seqN, rr.seqLabel, rr.shop, rr.job, rr.planStart, rr.planEnd, rr.actualEnd, rr.wip, rr.materialStatus, rr.outDate, rr.inDate, rr.etaDate, rr.reqDueDate, rr.orderNo]);
      }
      assignRows.push([osId]);
    }
    const { statusRows, timelineRows } = buildStatusTimelineRows(computed, asOf, computedAt);

    const shopMasterEntries = buildShopMasterRows(
      master.map((r) => ({
        shop: clean(r['SHOP']),
        job: clean(r['JOB']),
        name: clean(r['作業名称']),
        machine: clean(r['機械名称']),
      })),
      collectFlexShopJobs([...parts.values()].flatMap((agg) => agg.rows.map((rr) => ({ shop: rr.shop, job: rr.job })))),
      octName,
    );
    const shopMasterRows = shopMasterEntries.map((r) => [r.shop, r.job, r.name, r.machine, r.source]);
    const flexSupplementCount = shopMasterEntries.filter((r) => r.source === 'flexsche').length;
    if (flexSupplementCount > 0) {
      this.logger.log(`[etl] SHOP_JOB 未登録の FLEXSCHE 工程を ${flexSupplementCount} 件補完`);
    }
    const kishuRows = [...new Set(computed.map((x) => x.meta.kishu).filter(Boolean))].map((k) => [k]);
    const shopNameRows = [...octName].filter(([s, nm]) => s && nm).map(([s, nm]) => [s, nm]);

    const prevShopMaster = (await this.prisma.shopMaster.findMany()).map(toShopMasterRow);
    const prevKishu = new Set((await this.prisma.kishu.findMany({ select: { kishu: true } })).map((r) => r.kishu));

    const t0Db = Date.now();
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('DELETE FROM t_timeline');
        await tx.$executeRawUnsafe('DELETE FROM t_part_status');
        await tx.$executeRawUnsafe('DELETE FROM t_routing');
        await tx.$executeRawUnsafe('DELETE FROM t_part');
        await tx.$executeRawUnsafe('DELETE FROM t_shop_master');
        await tx.$executeRawUnsafe('DELETE FROM t_shop_name');
        await batchInsert(tx, 't_shop_master', ['shop', 'job', 'name', 'machine', 'source'], shopMasterRows,
          'ON CONFLICT (shop,job) DO UPDATE SET name=EXCLUDED.name, machine=EXCLUDED.machine, source=EXCLUDED.source');
        await batchInsert(tx, 't_part', ['os_id', 'part_no', 'part_name', 'category', 'kishu', 'final_due', 'pbs_due', 'oct_due', 'urgent_flag', 'shortage_flag'], partRows);
        await batchInsert(tx, 't_routing', ['os_id', 'seq', 'seq_label', 'shop', 'job', 'plan_start', 'plan_end', 'actual_end', 'wip_flag', 'material_status', 'out_date', 'in_date', 'eta_date', 'req_due_date', 'order_no'], routingRows);
        await batchInsert(tx, 't_part_status', ['os_id', 'part_no', 'part_name', 'category', 'kishu', 'final_due', 'total_shops', 'done_shops', 'remain_shops', 'current_shop', 'days_left', 'buffer', 'color', 'stagnant_days', 'urgent', 'shortage', 'computed_at'], statusRows);
        await batchInsert(tx, 't_timeline', ['os_id', 'seq', 'shop', 'name', 'status', 'plan_end', 'is_milestone', 'ms_passed', 'ms_color', 'ms_due', 'ms_behind', 'gaic', 'gaic_status', 'gaic_phase', 'order_no', 'out_date', 'in_date', 'eta_date', 'req_due_date'], timelineRows);
        await batchInsert(tx, 't_assignment', ['os_id'], assignRows, 'ON CONFLICT DO NOTHING');
        await batchInsert(tx, 'm_kishu', ['kishu'], kishuRows, 'ON CONFLICT DO NOTHING');
        await batchInsert(tx, 't_shop_name', ['shop', 'name'], shopNameRows);
        await tx.$executeRawUnsafe('DELETE FROM t_assignment WHERE os_id NOT IN (SELECT os_id FROM t_part)');
        await tx.$executeRawUnsafe('DELETE FROM t_trouble WHERE os_id NOT IN (SELECT os_id FROM t_part)');
        await tx.$executeRawUnsafe('DELETE FROM t_shelved WHERE os_id NOT IN (SELECT os_id FROM t_part)');
        await tx.$executeRawUnsafe('DELETE FROM t_watch WHERE os_id NOT IN (SELECT os_id FROM t_part)');
        await tx.$executeRawUnsafe('DELETE FROM t_note WHERE os_id NOT IN (SELECT os_id FROM t_part)');
      },
      { timeout: 600000, maxWait: 60000 },
    );
    this.logger.log(`[etl] db write ${Date.now() - t0Db}ms`);

    try {
      const { archived, restored } = await syncMilestoneArchive(this.prisma, auditUser);
      if (archived > 0 || restored > 0) {
        this.logger.log(`[etl] milestone archive sync archived=${archived} restored=${restored}`);
      }
    } catch (e) {
      this.logger.warn(`中間マイルストン過去マスタ同期に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      await this.auditImportedShopMaster(auditUser, prevShopMaster, shopMasterEntries);
      await this.auditImportedKishu(auditUser, prevKishu, kishuRows.map((r) => String(r[0])));
    } catch (e) {
      this.logger.warn(`監査記録に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }

    this.logger.log(`完了: t_part_status=${statusRows.length}件 / t_timeline=${timelineRows.length}件`);
    await this.asOf.persist(asOfYmd, auditUser);
    this.logger.log(`AS_OF persisted = ${asOfYmd}`);
    this.parts.clearCache();
    return { parts: statusRows.length, timeline: timelineRows.length };
  }

  private async auditImportedShopMaster(user: string, beforeRows: ShopMasterRow[], afterRows: ShopMasterRow[]): Promise<void> {
    const beforeMap = new Map(beforeRows.map((r) => [shopMasterKey(r), r]));
    const afterMap = new Map(afterRows.map((r) => [shopMasterKey(r), r]));
    const entries: Array<{ user: string; action: string; target: string; ref: string; before: unknown; after: unknown }> = [];

    for (const [key, after] of afterMap) {
      const before = beforeMap.get(key);
      if (!before) {
        entries.push({ user, action: 'master.import', target: 't_shop_master', ref: key, before: null, after });
      } else if (!shopMasterEqual(before, after)) {
        entries.push({ user, action: 'master.import', target: 't_shop_master', ref: key, before, after });
      }
    }
    for (const [key, before] of beforeMap) {
      if (!afterMap.has(key)) {
        entries.push({ user, action: 'master.import', target: 't_shop_master', ref: key, before, after: null });
      }
    }
    await this.audit.recordMany(entries);
  }

  private async auditImportedKishu(user: string, prev: Set<string>, imported: string[]): Promise<void> {
    const entries = imported
      .filter((kishu) => !prev.has(kishu))
      .map((kishu) => ({
        user,
        action: 'master.import',
        target: 'm_kishu',
        ref: kishu,
        before: null,
        after: { kishu, active: true },
      }));
    await this.audit.recordMany(entries);
  }

  /** 再計算：CSVを読まず、取込済みデータ＋現在マスタから算出のみ */
  async recompute(): Promise<EtlSummary> {
    if (!this.batchLock.acquire()) {
      throw new ConflictException('バッチ処理が実行中です');
    }
    try {
      return await this.recomputeInner();
    } finally {
      this.batchLock.release();
    }
  }

  private async recomputeInner(): Promise<EtlSummary> {
    const asOfYmd = await this.asOf.getEffective();
    const asOf = await this.asOf.getEffectiveDate();
    const M = await loadMasters(this.prisma);
    this.logger.log(`[recompute] AS_OF=${asOfYmd}`);

    const nameByShopJob = new Map<string, string>();
    const nameByShop = new Map<string, string>();
    const sm = await this.prisma.shopMaster.findMany({ select: { shop: true, job: true, name: true } });
    for (const r of sm) {
      const shop = String(r.shop ?? '');
      const job = String(r.job ?? '');
      const name = String(r.name ?? '');
      if (!shop || !name) continue;
      nameByShopJob.set(`${shop}::${job}`, name);
      if (!nameByShop.has(shop)) nameByShop.set(shop, name);
    }
    const octName = new Map<string, string>();
    const sn = await this.prisma.shopName.findMany({ select: { shop: true, name: true } });
    for (const r of sn) if (r.shop && r.name) octName.set(String(r.shop), String(r.name));
    const resolveName = buildNameResolver(nameByShopJob, nameByShop, octName);

    const calcOpts = buildCalcOpts(M);

    const partRes = await this.prisma.part.findMany({
      select: { osId: true, partNo: true, partName: true, kishu: true, pbsDue: true, octDue: true, urgentFlag: true },
    });
    const routeRes = await this.prisma.routing.findMany({ orderBy: [{ osId: 'asc' }, { seq: 'asc' }] });
    const rowsByOs = new Map<string, RoutingRow[]>();
    for (const r of routeRes) {
      const osId = String(r.osId);
      const seq = parseSeq(r.seqLabel ?? '');
      let arr = rowsByOs.get(osId);
      if (!arr) {
        arr = [];
        rowsByOs.set(osId, arr);
      }
      arr.push({
        osId,
        seqMain: seq.main,
        seqSub: seq.sub,
        seqLabel: r.seqLabel ?? '',
        shop: r.shop ?? '',
        job: r.job ?? '',
        planStart: r.planStart ?? null,
        planEnd: r.planEnd ?? null,
        actualEnd: r.actualEnd ?? null,
        wip: !!r.wipFlag,
        materialStatus: r.materialStatus ?? '',
        outDate: r.outDate ?? null,
        inDate: r.inDate ?? null,
        etaDate: r.etaDate ?? null,
        reqDueDate: r.reqDueDate ?? null,
        orderNo: r.orderNo ?? '',
      });
    }

    const computed = partRes.map((pr) => {
      const osId = String(pr.osId);
      const rows = rowsByOs.get(osId) ?? [];
      const flexMax = flexMaxFromRows(rows);
      const pbsDue: Date | null = pr.pbsDue ? new Date(pr.pbsDue) : null;
      const octDue: Date | null = pr.octDue ? new Date(pr.octDue) : null;
      const kishu = pr.kishu ?? '';
      const finalDue = resolveFinalDueForPart(kishu, { flexsche: flexMax, octopus: octDue, pbs: pbsDue }, M.kishuDuePriority, M.defaultKishuDuePriority);
      const meta: PartMeta = {
        osId,
        partNo: pr.partNo ?? '',
        name: pr.partName ?? '',
        category: deriveCategory(pr.partNo ?? '', M),
        kishu: pr.kishu ?? '',
        finalDue,
        urgent: !!pr.urgentFlag,
        shortage: false,
      };
      return { osId, meta, part: computePart(meta, rows, resolveName, asOf, calcOpts) };
    });

    const computedAt = new Date();
    const colors = aggregateColorCounts(computed.map((c) => c.part.color));
    const { statusRows, timelineRows } = buildStatusTimelineRows(computed, asOf, computedAt);

    const t0 = Date.now();
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('TRUNCATE t_timeline');
        await tx.$executeRawUnsafe('TRUNCATE t_part_status');
        await batchInsert(tx, 't_part_status', ['os_id', 'part_no', 'part_name', 'category', 'kishu', 'final_due', 'total_shops', 'done_shops', 'remain_shops', 'current_shop', 'days_left', 'buffer', 'color', 'stagnant_days', 'urgent', 'shortage', 'computed_at'], statusRows);
        await batchInsert(tx, 't_timeline', ['os_id', 'seq', 'shop', 'name', 'status', 'plan_end', 'is_milestone', 'ms_passed', 'ms_color', 'ms_due', 'ms_behind', 'gaic', 'gaic_status', 'gaic_phase', 'order_no', 'out_date', 'in_date', 'eta_date', 'req_due_date'], timelineRows);
      },
      { timeout: 600000, maxWait: 60000 },
    );
    this.logger.log(`[recompute] total ${Date.now() - t0}ms`);
    this.logger.log(`[recompute] 完了: t_part_status=${statusRows.length} / t_timeline=${timelineRows.length}`);
    this.parts.clearCache();
    return { parts: statusRows.length, timeline: timelineRows.length, colors };
  }
}
