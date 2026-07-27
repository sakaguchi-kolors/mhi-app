// ETL＋算出バッチ：CSV(CP932/UTF-8) → 取込 → 算出 → PostgreSQL
// プロトタイプ etl.ts を NestJS + Prisma へ移植。データフロー・ストリーム取込・
// バッチ投入の設計はそのまま。DBアクセスのみ pg → Prisma($executeRawUnsafe/型付きモデル) に置換。
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { readCsv, readCsvStream, clean } from './csv';
import { computePart, type PartMeta } from '../calc/calc';
import { loadMasters, type MasterContext } from '../masters/masters.util';
import { AuditService } from '../audit/audit.service';
import type { RoutingRow } from '../common/types';

// ---------- 日付パーサ ----------
function parseDateTime(s: string): Date | null {
  const v = clean(s);
  if (!v) return null;
  const datePart = v.split(/\s+/)[0];
  const m = datePart.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function parsePbsMonthEnd(s: string): Date | null {
  const v = clean(s);
  const m = v.match(/^(\d{4})[-/](\d{1,2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]), 0); // 当月末日
}

// ---------- 工程NO パース（例 071-3 → main=71, sub=3） ----------
function parseSeq(label: string): { main: number; sub: number } {
  const v = clean(label);
  const [a, b] = v.split('-');
  return { main: parseInt(a, 10) || 0, sub: b ? parseInt(b, 10) || 0 : 0 };
}

// ---------- 完成品分類の導出（m_category マスタ駆動。priority昇順で最初の一致） ----------
function deriveCategory(partNo: string, m: MasterContext): string {
  const p = clean(partNo).toUpperCase();
  for (const r of m.categoryRules) if (r.re.test(p)) return r.category;
  return 'その他';
}

// MM/DD を asOf 近傍の日付に補完（DB保存用。年跨ぎは近い方を採用）
function mmddToDate(mmdd: string | undefined, asOf: Date): Date | null {
  if (!mmdd) return null;
  const [m, d] = mmdd.split('/').map(Number);
  if (!m || !d) return null;
  const y = asOf.getFullYear();
  const cand = new Date(y, m - 1, d);
  const prev = new Date(y - 1, m - 1, d);
  const next = new Date(y + 1, m - 1, d);
  const arr = [prev, cand, next];
  arr.sort((a, b) => Math.abs(a.getTime() - asOf.getTime()) - Math.abs(b.getTime() - asOf.getTime()));
  return arr[0];
}

/**
 * 多値INSERTでまとめて投入する。1文あたりのプレースホルダ数が
 * PostgreSQLの上限(65535)を超えないよう、列数からチャンクサイズを決める。
 * conflict に "ON CONFLICT ..." 節を渡せる。
 */
async function batchInsert(
  tx: Prisma.TransactionClient,
  table: string,
  cols: string[],
  rows: unknown[][],
  conflict = '',
): Promise<void> {
  if (rows.length === 0) return;
  const chunk = Math.max(1, Math.floor(30000 / cols.length)); // 上限65535に十分な余裕
  const colList = cols.join(',');
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const tuples = slice.map((row) => {
      const ph = row.map((_, k) => `$${params.length + k + 1}`);
      params.push(...row);
      return `(${ph.join(',')})`;
    });
    await tx.$executeRawUnsafe(`INSERT INTO ${table}(${colList}) VALUES ${tuples.join(',')} ${conflict}`, ...params);
  }
}

export interface EtlSummary {
  parts: number;
  timeline: number;
}

type ShopMasterRow = { shop: string; job: string; name: string | null; machine: string | null };

function shopMasterKey(row: ShopMasterRow): string {
  return `${row.shop}::${row.job}`;
}

function shopMasterEqual(a: ShopMasterRow, b: ShopMasterRow): boolean {
  return a.name === b.name && a.machine === b.machine;
}

function toShopMasterRow(r: { shop: unknown; job: unknown; name: unknown; machine: unknown }): ShopMasterRow {
  return {
    shop: String(r.shop ?? ''),
    job: String(r.job ?? ''),
    name: r.name == null ? null : String(r.name),
    machine: r.machine == null ? null : String(r.machine),
  };
}

interface Agg {
  partNo: string;
  partName: string;
  kishu: string;
  urgent: boolean;
  rows: RoutingRow[];
}

@Injectable()
export class EtlService {
  private readonly logger = new Logger('ETL');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  /** CSV取込＋算出＋DB洗い替え（①②のみ。③アプリ固有は残す） */
  async runEtl(opts: { dry?: boolean; user?: string } = {}): Promise<EtlSummary> {
    const dry = opts.dry ?? false;
    const auditUser = opts.user ?? 'etl';
    const { csvDir, files } = this.config;
    const asOf = this.config.asOfDate;
    const M = await loadMasters(this.prisma); // マスタ読込（算出の挙動を規定）
    this.logger.log(`CSV_DIR = ${csvDir}`);
    this.logger.log(`AS_OF = ${this.config.asOf} / DUE_SOURCE = ${M.params.dueSource} (master)`);

    // マスタは小さいので全読み込み（後段のDB投入でも再利用）
    const master = readCsv(csvDir, files.shopMaster);

    // 作業名称リゾルバの土台（マスタ由来）。Octopus最頻値は後段で補完
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

    // ----- FLEXSCHE を OS_ID ごとに集約（=部品）。ストリームで単一パス -----
    const parts = new Map<string, Agg>();
    console.time('[etl] read flexsche');
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
        wip: clean(r['仕掛']) === '1',
        materialStatus: clean(r['払出状況']),
        outDate: parseDateTime(r['外注持出日']),
        inDate: parseDateTime(r['外注持込日']),
        etaDate: parseDateTime(r['納入予定日']),
        orderNo: clean(r['注文番号']),
      });
    });
    console.timeEnd('[etl] read flexsche');

    // ----- PBS：部品名称の補完元・子部品欠品・計画納期（OS_IDごと先勝ち）。ストリーム -----
    const nameFromPbs = new Map<string, string>();
    const shortageByOsId = new Map<string, boolean>();
    const dueMonthByOsId = new Map<string, string>();
    console.time('[etl] read pbs');
    const nPbs = await readCsvStream(csvDir, files.pbs, (r) => {
      const osId = clean(r['OS_ID']);
      if (!osId) return;
      if (!nameFromPbs.has(osId)) {
        const nm = clean(r['部品名称']);
        if (nm) nameFromPbs.set(osId, nm);
      }
      if (clean(r['内作子部品ショーテージ'])) shortageByOsId.set(osId, true);
      if (!dueMonthByOsId.has(osId)) {
        const d = clean(r['計画納期']);
        if (d) dueMonthByOsId.set(osId, d);
      }
    });
    console.timeEnd('[etl] read pbs');

    // ----- OCTPuS（最大 ~1.8GB/450万行）：DBには保存せず補完辞書のみ作る。ストリーム -----
    const octFreq = new Map<string, Map<string, number>>();
    const nameFromOct = new Map<string, string>();
    console.time('[etl] read octopus');
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
      if (osId && parts.has(osId) && !nameFromOct.has(osId)) {
        const nm = clean(r['部品名称']);
        if (nm) nameFromOct.set(osId, nm);
      }
    });
    console.timeEnd('[etl] read octopus');

    // SHOPごとの最頻手順内容を確定
    const octName = new Map<string, string>();
    for (const [shop, m] of octFreq) {
      let best = '';
      let bestN = -1;
      for (const [proc, n] of m) if (n > bestN) { best = proc; bestN = n; }
      octName.set(shop, best);
    }
    const resolveName = (shop: string, job: string): string =>
      nameByShopJob.get(`${shop}::${job}`) ?? nameByShop.get(shop) ?? octName.get(shop) ?? `Shop ${shop}`;

    this.logger.log(`rows: flex=${nFlex} pbs=${nPbs} octopus=${nOct} master=${master.length}`);
    this.logger.log(`部品(OS_ID)数 = ${parts.size}`);

    // ===== メタ生成＋算出（DB非依存） =====
    const buildMeta = (osId: string, agg: Agg): PartMeta => {
      const flexMax = (): Date | null => {
        let d: Date | null = null;
        for (const rr of agg.rows) if (rr.planEnd && (!d || rr.planEnd > d)) d = rr.planEnd;
        return d;
      };
      const pbsEnd = () => parsePbsMonthEnd(dueMonthByOsId.get(osId) ?? '');
      const finalDue: Date | null =
        M.params.dueSource === 'pbs' ? (pbsEnd() ?? flexMax()) : (flexMax() ?? pbsEnd());
      return {
        osId,
        partNo: agg.partNo,
        name: agg.partName || nameFromPbs.get(osId) || nameFromOct.get(osId) || '',
        category: deriveCategory(agg.partNo, M),
        kishu: agg.kishu,
        finalDue,
        urgent: agg.urgent,
        shortage: shortageByOsId.get(osId) ?? false,
      };
    };
    const calcOpts = {
      shopLtDays: M.params.shopLtDays,
      milestoneLtDays: M.params.milestoneLtDays,
      stagnantThreshold: M.params.stagnantThreshold,
      bufGreen: M.params.bufGreen,
      bufYellow: M.params.bufYellow,
      milestoneRules: M.milestoneRules,
      shopLt: M.shopLt,
      holidays: M.holidays,
    };
    const computed = [...parts].map(([osId, agg]) => {
      const meta = buildMeta(osId, agg);
      return { osId, agg, meta, part: computePart(meta, agg.rows, resolveName, asOf, calcOpts) };
    });

    // ===== ドライラン（--dry）：DBに触れず集計サマリと数例を出力 =====
    if (dry) {
      const by = (c: string) => computed.filter((x) => x.part.color === c).length;
      this.logger.log(`[dry] 色分布  red=${by('red')} yellow=${by('yellow')} green=${by('green')}`);
      this.logger.log(`[dry] 滞留(>=${M.params.stagnantThreshold}日) = ${computed.filter((x) => x.part.stagnant >= M.params.stagnantThreshold).length}`);
      this.logger.log(`[dry] 赤紙 = ${computed.filter((x) => x.part.urgent).length} / 子部品欠品 = ${computed.filter((x) => x.part.shortage).length}`);
      this.logger.log(`[dry] 完成品分類 = ${[...new Set(computed.map((x) => x.part.category))].join(', ')}`);
      return { parts: computed.length, timeline: computed.reduce((s, x) => s + x.part.timeline.length, 0) };
    }

    // ===== DB 洗い替え（①②のみ。③アプリ固有は残す） =====
    const computedAt = new Date();
    const partRows: unknown[][] = [];
    const routingRows: unknown[][] = [];
    const statusRows: unknown[][] = [];
    const timelineRows: unknown[][] = [];
    const assignRows: unknown[][] = [];
    for (const { osId, agg, meta, part } of computed) {
      const finalDue = meta.finalDue;
      const pbsDue = parsePbsMonthEnd(dueMonthByOsId.get(osId) ?? ''); // DUE_SOURCE=pbs 再現のため保持
      partRows.push([osId, meta.partNo, meta.name, meta.category, meta.kishu, finalDue, pbsDue, meta.urgent, meta.shortage]);
      let seqN = 0;
      for (const rr of [...agg.rows].sort((a, b) => a.seqMain - b.seqMain || a.seqSub - b.seqSub)) {
        seqN++;
        routingRows.push([osId, seqN, rr.seqLabel, rr.shop, rr.job, rr.planStart, rr.planEnd, rr.wip, rr.materialStatus, rr.outDate, rr.inDate, rr.etaDate, rr.orderNo]);
      }
      statusRows.push([osId, part.partNo, part.name, part.category, part.kishu, finalDue, part.totalShops, part.doneShops, part.remainShops, part.currentShop, part.daysLeft, part.buffer, part.color, part.stagnant, part.urgent, part.shortage, computedAt]);
      let tseq = 0;
      for (const t of part.timeline) {
        tseq++;
        timelineRows.push([osId, tseq, t.shop, t.name, t.status, mmddToDate(t.plan, asOf), !!t.milestone, t.mpassed ?? null, t.mcolor ?? null, mmddToDate(t.mdue, asOf), !!t.gaic, t.gstat ?? null, t.gorder ?? null]);
      }
      assignRows.push([osId]); // アプリ固有テーブルの土台行（既存は温存）
    }

    // Shopマスタは (shop,job) で重複しうるため後勝ちでdedup（多値INSERTのON CONFLICT二重更新を回避）
    const shopMasterMap = new Map<string, unknown[]>();
    for (const r of master) {
      const shop = clean(r['SHOP']);
      const job = clean(r['JOB']);
      if (!shop) continue;
      shopMasterMap.set(`${shop}::${job}`, [shop, job, clean(r['作業名称']), clean(r['機械名称'])]);
    }
    const shopMasterRows = [...shopMasterMap.values()];
    const kishuRows = [...new Set(computed.map((x) => x.meta.kishu).filter(Boolean))].map((k) => [k]);
    const shopNameRows = [...octName].filter(([s, nm]) => s && nm).map(([s, nm]) => [s, nm]);

    const prevShopMaster = (await this.prisma.shopMaster.findMany()).map(toShopMasterRow);
    const prevKishu = new Set((await this.prisma.kishu.findMany({ select: { kishu: true } })).map((r) => r.kishu));

    console.time('[etl] db write');
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('TRUNCATE t_part, t_routing, t_shop_master, t_shop_name, t_part_status, t_timeline');
        await batchInsert(tx, 't_shop_master', ['shop', 'job', 'name', 'machine'], shopMasterRows,
          'ON CONFLICT (shop,job) DO UPDATE SET name=EXCLUDED.name, machine=EXCLUDED.machine');
        await batchInsert(tx, 't_part', ['os_id', 'part_no', 'part_name', 'category', 'kishu', 'final_due', 'pbs_due', 'urgent_flag', 'shortage_flag'], partRows);
        await batchInsert(tx, 't_routing', ['os_id', 'seq', 'seq_label', 'shop', 'job', 'plan_start', 'plan_end', 'wip_flag', 'material_status', 'out_date', 'in_date', 'eta_date', 'order_no'], routingRows);
        await batchInsert(tx, 't_part_status', ['os_id', 'part_no', 'part_name', 'category', 'kishu', 'final_due', 'total_shops', 'done_shops', 'remain_shops', 'current_shop', 'days_left', 'buffer', 'color', 'stagnant_days', 'urgent', 'shortage', 'computed_at'], statusRows);
        await batchInsert(tx, 't_timeline', ['os_id', 'seq', 'shop', 'name', 'status', 'plan_end', 'is_milestone', 'ms_passed', 'ms_color', 'ms_due', 'gaic', 'gaic_status', 'order_no'], timelineRows);
        await batchInsert(tx, 't_assignment', ['os_id'], assignRows, 'ON CONFLICT DO NOTHING');
        // 出現した機種を m_kishu へ自動登録（担当は空。既存の担当割当は温存）
        await batchInsert(tx, 'm_kishu', ['kishu'], kishuRows, 'ON CONFLICT DO NOTHING');
        // OCTPuS由来のShop名フォールバックをキャッシュ（再計算がCSVを読まず名称解決できるように）
        await batchInsert(tx, 't_shop_name', ['shop', 'name'], shopNameRows);
      },
      { timeout: 600000, maxWait: 60000 },
    );
    console.timeEnd('[etl] db write');

    await this.auditImportedShopMaster(auditUser, prevShopMaster, shopMasterRows.map((r) => toShopMasterRow({
      shop: r[0], job: r[1], name: r[2], machine: r[3],
    })));
    await this.auditImportedKishu(auditUser, prevKishu, kishuRows.map((r) => String(r[0])));

    this.logger.log(`完了: t_part_status=${statusRows.length}件 / t_timeline=${timelineRows.length}件`);
    return { parts: statusRows.length, timeline: timelineRows.length };
  }

  /** 取込による t_shop_master の行単位差分を監査ログへ記録 */
  private async auditImportedShopMaster(user: string, beforeRows: ShopMasterRow[], afterRows: ShopMasterRow[]): Promise<void> {
    const beforeMap = new Map(beforeRows.map((r) => [shopMasterKey(r), r]));
    const afterMap = new Map(afterRows.map((r) => [shopMasterKey(r), r]));

    for (const [key, after] of afterMap) {
      const before = beforeMap.get(key);
      if (!before) {
        await this.audit.record(user, 'master.import', 't_shop_master', key, null, after);
      } else if (!shopMasterEqual(before, after)) {
        await this.audit.record(user, 'master.import', 't_shop_master', key, before, after);
      }
    }
    for (const [key, before] of beforeMap) {
      if (!afterMap.has(key)) {
        await this.audit.record(user, 'master.import', 't_shop_master', key, before, null);
      }
    }
  }

  /** 取込で新規登録された m_kishu を監査ログへ記録 */
  private async auditImportedKishu(user: string, prev: Set<string>, imported: string[]): Promise<void> {
    for (const kishu of imported) {
      if (prev.has(kishu)) continue;
      await this.audit.record(user, 'master.import', 'm_kishu', kishu, null, { kishu, active: true });
    }
  }

  /**
   * 再計算：CSVを読まず、取込済みの生データ(t_part/t_routing)＋現在のマスタから算出だけやり直す。
   * マスタ編集の反映用。巨大CSV(OCTPuS)を読まないので高速。
   */
  async recompute(): Promise<EtlSummary> {
    const asOf = this.config.asOfDate;
    const M = await loadMasters(this.prisma);
    this.logger.log(`[recompute] AS_OF=${this.config.asOf} / DUE_SOURCE=${M.params.dueSource}（DB上の取込済みデータから算出のみ）`);
    console.time('[recompute] total');

    // 名称リゾルバ（DBのみ：t_shop_master ＋ OCTPuS由来キャッシュ t_shop_name）
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
    const resolveName = (shop: string, job: string): string =>
      nameByShopJob.get(`${shop}::${job}`) ?? nameByShop.get(shop) ?? octName.get(shop) ?? `Shop ${shop}`;

    const calcOpts = {
      shopLtDays: M.params.shopLtDays,
      milestoneLtDays: M.params.milestoneLtDays,
      stagnantThreshold: M.params.stagnantThreshold,
      bufGreen: M.params.bufGreen,
      bufYellow: M.params.bufYellow,
      milestoneRules: M.milestoneRules,
      shopLt: M.shopLt,
      holidays: M.holidays,
    };

    // 取込済み生データ
    const partRes = await this.prisma.part.findMany({
      select: { osId: true, partNo: true, partName: true, kishu: true, pbsDue: true, urgentFlag: true, shortageFlag: true },
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
        wip: !!r.wipFlag,
        materialStatus: r.materialStatus ?? '',
        outDate: r.outDate ?? null,
        inDate: r.inDate ?? null,
        etaDate: r.etaDate ?? null,
        orderNo: r.orderNo ?? '',
      });
    }

    const computed = partRes.map((pr) => {
      const osId = String(pr.osId);
      const rows = rowsByOs.get(osId) ?? [];
      let flexMax: Date | null = null;
      for (const rr of rows) if (rr.planEnd && (!flexMax || rr.planEnd > flexMax)) flexMax = rr.planEnd;
      const pbsDue: Date | null = pr.pbsDue ? new Date(pr.pbsDue) : null;
      const finalDue: Date | null = M.params.dueSource === 'pbs' ? (pbsDue ?? flexMax) : (flexMax ?? pbsDue);
      const meta: PartMeta = {
        osId,
        partNo: pr.partNo ?? '',
        name: pr.partName ?? '',
        category: deriveCategory(pr.partNo ?? '', M),
        kishu: pr.kishu ?? '',
        finalDue,
        urgent: !!pr.urgentFlag,
        shortage: !!pr.shortageFlag,
      };
      return { osId, meta, part: computePart(meta, rows, resolveName, asOf, calcOpts) };
    });

    const computedAt = new Date();
    const statusRows: unknown[][] = [];
    const timelineRows: unknown[][] = [];
    for (const { osId, meta, part } of computed) {
      statusRows.push([osId, part.partNo, part.name, part.category, part.kishu, meta.finalDue, part.totalShops, part.doneShops, part.remainShops, part.currentShop, part.daysLeft, part.buffer, part.color, part.stagnant, part.urgent, part.shortage, computedAt]);
      let tseq = 0;
      for (const t of part.timeline) {
        tseq++;
        timelineRows.push([osId, tseq, t.shop, t.name, t.status, mmddToDate(t.plan, asOf), !!t.milestone, t.mpassed ?? null, t.mcolor ?? null, mmddToDate(t.mdue, asOf), !!t.gaic, t.gstat ?? null, t.gorder ?? null]);
      }
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('TRUNCATE t_part_status, t_timeline'); // 生データ(t_part/t_routing)は温存
        await batchInsert(tx, 't_part_status', ['os_id', 'part_no', 'part_name', 'category', 'kishu', 'final_due', 'total_shops', 'done_shops', 'remain_shops', 'current_shop', 'days_left', 'buffer', 'color', 'stagnant_days', 'urgent', 'shortage', 'computed_at'], statusRows);
        await batchInsert(tx, 't_timeline', ['os_id', 'seq', 'shop', 'name', 'status', 'plan_end', 'is_milestone', 'ms_passed', 'ms_color', 'ms_due', 'gaic', 'gaic_status', 'order_no'], timelineRows);
      },
      { timeout: 600000, maxWait: 60000 },
    );
    console.timeEnd('[recompute] total');
    this.logger.log(`[recompute] 完了: t_part_status=${statusRows.length} / t_timeline=${timelineRows.length}`);
    return { parts: statusRows.length, timeline: timelineRows.length };
  }
}
