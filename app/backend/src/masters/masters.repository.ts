// マスタ CRUD の Prisma 実装（masters.service から利用）
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { milestoneRowKey, parseMilestoneRowKey } from './milestone-mark.util';
import { isShopJobMasterSource, loadMilestoneUsageStats } from './milestone-usage.util';
import { DUE_SOURCE_KINDS, isDefaultKishuDuePriority, parseDefaultKishuDuePriority, type DueSourceKind } from '../etl/etl-compute.util';
import type { ColDef, MasterDef } from './masters.def';

export type MasterRow = Record<string, unknown>;

const AUDIT_COLS = new Set(['created_at', 'created_by', 'updated_at', 'updated_by']);

/** API Row（snake_case 列名）→ Prisma モデルフィールド */
const FIELD_MAP: Record<string, string> = {
  match_type: 'matchType',
  lt_days: 'ltDays',
  priority_1: 'priority1',
  priority_2: 'priority2',
  priority_3: 'priority3',
  is_milestone: 'isMilestone',
  in_use: 'inUse',
  last_used_at: 'lastUsedAt',
  archived_manual: 'archivedManual',
  cal_date: 'calDate',
  is_workday: 'isWorkday',
  order_prefix: 'orderPrefix',
  vendor_name: 'vendorName',
  return_lt: 'returnLt',
};

function toPrismaKey(col: string): string {
  return FIELD_MAP[col] ?? col;
}

function coerce(col: ColDef, v: unknown): unknown {
  if (v === '' || v === undefined || v === null) return null;
  if (col.type === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new BadRequestException(`${col.label}は数値で入力してください`);
    return n;
  }
  if (col.type === 'bool') return v === true || v === 'true' || v === 'on';
  if (col.type === 'date') return new Date(String(v).slice(0, 10));
  return String(v);
}

function serializeValue(key: string, v: unknown): unknown {
  if (v == null) return null;
  if (v instanceof Date) {
    if (key === 'cal_date' || key === 'last_used_at') return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
    return v.toISOString();
  }
  if (typeof v === 'object' && 'toFixed' in (v as object)) return String(v);
  if (typeof v === 'boolean') return v;
  return v;
}

/** Prisma レコード → API Row（masters.def の列名） */
export function modelToRow(def: MasterDef, record: Record<string, unknown>): MasterRow {
  const out: MasterRow = {};
  for (const c of def.columns) {
    const prismaKey = toPrismaKey(c.key);
    out[c.key] = serializeValue(c.key, record[prismaKey]);
  }
  const pkPrisma = toPrismaKey(def.pk);
  if (def.pk in out) {
    /* already set */
  } else if (pkPrisma in record) {
    out[def.pk] = serializeValue(def.pk, record[pkPrisma]);
  }
  for (const k of ['created_at', 'created_by', 'updated_at', 'updated_by'] as const) {
    const pk = k === 'created_at' ? 'createdAt' : k === 'created_by' ? 'createdBy' : k === 'updated_at' ? 'updatedAt' : 'updatedBy';
    if (pk in record) out[k] = serializeValue(k, record[pk]);
  }
  return out;
}

function buildData(def: MasterDef, body: MasterRow, user: string, cols: string[]): Record<string, unknown> {
  const colOf = (k: string): ColDef => def.columns.find((c) => c.key === k) ?? { key: k, label: k, type: 'text' };
  const data: Record<string, unknown> = { updatedAt: new Date(), updatedBy: user };
  for (const k of cols) {
    if (AUDIT_COLS.has(k)) continue;
    data[toPrismaKey(k)] = coerce(colOf(k), body[k]);
  }
  return data;
}

function orderBy(def: MasterDef): Record<string, 'asc'> {
  return { [toPrismaKey(def.pk)]: 'asc' };
}

function validateKishuDuePriority(body: MasterRow): DueSourceKind[] {
  const p = [String(body.priority_1 ?? ''), String(body.priority_2 ?? ''), String(body.priority_3 ?? '')] as DueSourceKind[];
  if (p.some((x) => !DUE_SOURCE_KINDS.includes(x))) {
    throw new BadRequestException('優先順位は flexsche / octopus / pbs から選んでください');
  }
  if (new Set(p).size !== 3) {
    throw new BadRequestException('優先順位は重複なく3つ指定してください');
  }
  return p;
}

@Injectable()
export class MastersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** SHOP_JOBマスタ全行 + m_milestone のフラグ + 利用状況をマージ */
  private async findMilestoneRows(def: MasterDef): Promise<MasterRow[]> {
    const [shops, marks, usageMap] = await Promise.all([
      this.prisma.shopMaster.findMany({ orderBy: [{ shop: 'asc' }, { job: 'asc' }] }),
      this.prisma.milestone.findMany(),
      loadMilestoneUsageStats(this.prisma),
    ]);
    const markMap = new Map(marks.map((m) => [milestoneRowKey(m.shop, m.job), m]));
    return shops.filter((sm) => isShopJobMasterSource(sm.source)).map((sm) => {
      const shop = String(sm.shop);
      const job = String(sm.job);
      const key = milestoneRowKey(shop, job);
      const m = markMap.get(key);
      const usage = usageMap.get(key) ?? { inUse: false, lastUsedAt: null };
      const record: Record<string, unknown> = {
        shop,
        job,
        name: sm.name,
        source: sm.source ?? 'shop_job',
        inUse: usage.inUse,
        lastUsedAt: usage.lastUsedAt,
        isMilestone: m?.isMilestone ?? false,
        gaic: m?.gaic ?? false,
        archived: m?.archived ?? !usage.inUse,
        archivedManual: m?.archivedManual ?? false,
        shop_job: key,
        createdAt: m?.createdAt,
        createdBy: m?.createdBy,
        updatedAt: m?.updatedAt,
        updatedBy: m?.updatedBy,
      };
      return modelToRow(def, record);
    });
  }

  /** 全機種 + 優先順位（標準は m_param、個別のみ m_kishu_due_priority に保持） */
  private async findKishuDuePriorityRows(def: MasterDef): Promise<MasterRow[]> {
    const [kishus, priorities, params] = await Promise.all([
      this.prisma.kishu.findMany({ where: { active: true }, orderBy: { kishu: 'asc' } }),
      this.prisma.kishuDuePriority.findMany(),
      this.prisma.param.findMany({ where: { key: { startsWith: 'KISHU_DUE_PRIORITY_' } }, select: { key: true, value: true } }),
    ]);
    const pmap = new Map(params.map((p) => [p.key, p.value]));
    const defaultPriority = parseDefaultKishuDuePriority(pmap);
    const customMap = new Map(priorities.map((p) => [p.kishu, p]));
    return kishus.map((k) => {
      const custom = customMap.get(k.kishu);
      const priority = custom
        ? ([custom.priority1, custom.priority2, custom.priority3] as DueSourceKind[])
        : defaultPriority;
      const record: Record<string, unknown> = {
        kishu: k.kishu,
        mode: custom ? 'custom' : 'default',
        priority1: priority[0],
        priority2: priority[1],
        priority3: priority[2],
      };
      if (custom) {
        record.createdAt = custom.createdAt;
        record.createdBy = custom.createdBy;
        record.updatedAt = custom.updatedAt;
        record.updatedBy = custom.updatedBy;
      }
      return modelToRow(def, record);
    });
  }

  private async loadDefaultKishuDuePriority(): Promise<DueSourceKind[]> {
    const params = await this.prisma.param.findMany({
      where: { key: { startsWith: 'KISHU_DUE_PRIORITY_' } },
      select: { key: true, value: true },
    });
    return parseDefaultKishuDuePriority(new Map(params.map((p) => [p.key, p.value])));
  }

  async findAll(def: MasterDef): Promise<MasterRow[]> {
    switch (def.name) {
      case 'param':
        return (await this.prisma.param.findMany({ orderBy: { key: 'asc' } })).map((r) => modelToRow(def, r as Record<string, unknown>));
      case 'milestone':
        return this.findMilestoneRows(def);
      case 'kishu_due_priority':
        return this.findKishuDuePriorityRows(def);
      case 'shop_lt':
        return (await this.prisma.shopLt.findMany({ orderBy: { shop: 'asc' } })).map((r) => modelToRow(def, r as Record<string, unknown>));
      case 'calendar':
        return (await this.prisma.calendar.findMany({ orderBy: { calDate: 'asc' } })).map((r) => modelToRow(def, r as Record<string, unknown>));
      case 'vendor':
        return (await this.prisma.vendor.findMany({ orderBy: { orderPrefix: 'asc' } })).map((r) => modelToRow(def, r as Record<string, unknown>));
      case 'category':
        return (await this.prisma.category.findMany({ orderBy: { id: 'asc' } })).map((r) => modelToRow(def, r as Record<string, unknown>));
      default:
        return [];
    }
  }

  async findOne(def: MasterDef, id: unknown): Promise<MasterRow | null> {
    const row = await this.findAll(def);
    const pk = def.pk;
    const hit = row.find((r) => String(r[pk]) === String(id));
    return hit ?? null;
  }

  async upsert(def: MasterDef, user: string, body: MasterRow): Promise<MasterRow> {
    const cols = def.columns.map((c) => c.key).filter((k) => k in body && !AUDIT_COLS.has(k));
    const pkVal = body[def.pk];
    const now = new Date();

    switch (def.name) {
      case 'param': {
        const data = buildData(def, body, user, cols) as Prisma.ParamUpdateInput;
        const row = await this.prisma.param.upsert({
          where: { key: String(pkVal ?? body.key) },
          create: {
            key: String(body.key),
            value: String(body.value ?? ''),
            description: body.description == null ? null : String(body.description),
            createdAt: now,
            createdBy: user,
            updatedAt: now,
            updatedBy: user,
          },
          update: data,
        });
        return modelToRow(def, row as Record<string, unknown>);
      }
      case 'milestone': {
        const shop = String(body.shop ?? '');
        const job = String(body.job ?? '');
        if (!shop || !job) throw new BadRequestException('SHOP と JOB が必要です');
        const smRow = await this.prisma.shopMaster.findUnique({ where: { shop_job: { shop, job } } });
        if (!smRow || !isShopJobMasterSource(smRow.source)) {
          throw new BadRequestException('中間マイルストンは SHOP_JOB マスタの工程のみ指定できます');
        }
        const isMs = body.is_milestone === true || body.is_milestone === 'true';
        const gaic = body.gaic === true || body.gaic === 'true';
        const key = milestoneRowKey(shop, job);
        const existing = await this.prisma.milestone.findUnique({ where: { shop_job: { shop, job } } });
        const usage = (await loadMilestoneUsageStats(this.prisma)).get(key) ?? { inUse: false, lastUsedAt: null };
        const archivedTouched = 'archived' in body;
        const archived = archivedTouched
          ? body.archived === true || body.archived === 'true'
          : (existing?.archived ?? !usage.inUse);
        const archivedManual = archivedTouched ? true : (existing?.archivedManual ?? false);

        if (!isMs && !gaic && !archived) {
          await this.prisma.milestone.deleteMany({ where: { shop, job } });
          const sm = await this.prisma.shopMaster.findUnique({ where: { shop_job: { shop, job } } });
          return modelToRow(def, {
            shop,
            job,
            shop_job: key,
            name: sm?.name ?? body.name ?? '',
            inUse: usage.inUse,
            lastUsedAt: usage.lastUsedAt,
            isMilestone: false,
            gaic: false,
            archived: !usage.inUse,
            archivedManual: false,
          });
        }

        const row = await this.prisma.milestone.upsert({
          where: { shop_job: { shop, job } },
          create: {
            shop,
            job,
            isMilestone: isMs,
            gaic,
            archived,
            archivedManual,
            createdAt: now,
            createdBy: user,
            updatedAt: now,
            updatedBy: user,
          },
          update: {
            isMilestone: isMs,
            gaic,
            archived,
            archivedManual,
            updatedAt: now,
            updatedBy: user,
          },
        });
        const sm = await this.prisma.shopMaster.findUnique({ where: { shop_job: { shop, job } } });
        const record: Record<string, unknown> = {
          ...row,
          name: sm?.name ?? body.name ?? '',
          shop_job: key,
          inUse: usage.inUse,
          lastUsedAt: usage.lastUsedAt,
        };
        return modelToRow(def, record);
      }
      case 'shop_lt': {
        const data = buildData(def, body, user, cols) as Prisma.ShopLtUpdateInput;
        const shop = String(body.shop);
        const row = await this.prisma.shopLt.upsert({
          where: { shop },
          create: {
            shop,
            ltDays: Number(body.lt_days ?? 0),
            active: body.active !== false && body.active !== 'false',
            createdAt: now,
            createdBy: user,
            updatedAt: now,
            updatedBy: user,
          },
          update: data,
        });
        return modelToRow(def, row as Record<string, unknown>);
      }
      case 'calendar': {
        const data = buildData(def, body, user, cols) as Prisma.CalendarUpdateInput;
        const calDate = new Date(String(body.cal_date).slice(0, 10));
        const row = await this.prisma.calendar.upsert({
          where: { calDate },
          create: {
            calDate,
            isWorkday: body.is_workday === true || body.is_workday === 'true',
            note: body.note == null ? null : String(body.note),
            createdAt: now,
            createdBy: user,
            updatedAt: now,
            updatedBy: user,
          },
          update: data,
        });
        return modelToRow(def, row as Record<string, unknown>);
      }
      case 'vendor': {
        const data = buildData(def, body, user, cols) as Prisma.VendorUpdateInput;
        const orderPrefix = String(body.order_prefix);
        const row = await this.prisma.vendor.upsert({
          where: { orderPrefix },
          create: {
            orderPrefix,
            vendorName: String(body.vendor_name ?? ''),
            returnLt: body.return_lt == null || body.return_lt === '' ? null : Number(body.return_lt),
            active: body.active !== false && body.active !== 'false',
            createdAt: now,
            createdBy: user,
            updatedAt: now,
            updatedBy: user,
          },
          update: data,
        });
        return modelToRow(def, row as Record<string, unknown>);
      }
      case 'kishu_due_priority': {
        const kishu = String(body.kishu ?? pkVal ?? '');
        if (!kishu) throw new BadRequestException('機種が必要です');
        const mode = String(body.mode ?? 'custom');
        const defaultPriority = await this.loadDefaultKishuDuePriority();
        if (mode === 'default') {
          await this.prisma.kishuDuePriority.deleteMany({ where: { kishu } });
          return modelToRow(def, {
            kishu,
            mode: 'default',
            priority1: defaultPriority[0],
            priority2: defaultPriority[1],
            priority3: defaultPriority[2],
          });
        }
        const [p1, p2, p3] = validateKishuDuePriority(body);
        if (isDefaultKishuDuePriority([p1, p2, p3], defaultPriority)) {
          await this.prisma.kishuDuePriority.deleteMany({ where: { kishu } });
          return modelToRow(def, {
            kishu,
            mode: 'default',
            priority1: defaultPriority[0],
            priority2: defaultPriority[1],
            priority3: defaultPriority[2],
          });
        }
        const row = await this.prisma.kishuDuePriority.upsert({
          where: { kishu },
          create: {
            kishu,
            priority1: p1,
            priority2: p2,
            priority3: p3,
            createdAt: now,
            createdBy: user,
            updatedAt: now,
            updatedBy: user,
          },
          update: {
            priority1: p1,
            priority2: p2,
            priority3: p3,
            updatedAt: now,
            updatedBy: user,
          },
        });
        return modelToRow(def, { ...row, mode: 'custom' } as Record<string, unknown>);
      }
      case 'category': {
        const data = buildData(def, body, user, cols) as Prisma.CategoryUpdateInput;
        if (def.autoId && pkVal != null && pkVal !== '') {
          const row = await this.prisma.category.update({
            where: { id: Number(pkVal) },
            data,
          });
          return modelToRow(def, row as Record<string, unknown>);
        }
        const row = await this.prisma.category.create({
          data: {
            pattern: String(body.pattern ?? ''),
            category: String(body.category ?? ''),
            priority: Number(body.priority ?? 100),
            active: body.active !== false && body.active !== 'false',
            createdAt: now,
            createdBy: user,
            updatedAt: now,
            updatedBy: user,
          },
        });
        return modelToRow(def, row as Record<string, unknown>);
      }
      default:
        throw new Error(`unsupported master: ${def.name}`);
    }
  }

  async delete(def: MasterDef, id: string): Promise<void> {
    switch (def.name) {
      case 'param':
        await this.prisma.param.delete({ where: { key: id } });
        return;
      case 'milestone': {
        const { shop, job } = parseMilestoneRowKey(id);
        await this.prisma.milestone.deleteMany({ where: { shop, job } });
        return;
      }
      case 'shop_lt':
        await this.prisma.shopLt.delete({ where: { shop: id } });
        return;
      case 'calendar':
        await this.prisma.calendar.delete({ where: { calDate: new Date(id) } });
        return;
      case 'vendor':
        await this.prisma.vendor.delete({ where: { orderPrefix: id } });
        return;
      case 'kishu_due_priority':
        await this.prisma.kishuDuePriority.deleteMany({ where: { kishu: id } });
        return;
      case 'category':
        await this.prisma.category.delete({ where: { id: Number(id) } });
        return;
      default:
        throw new Error(`unsupported master: ${def.name}`);
    }
  }
}

// orderBy helper exported for tests if needed
export { orderBy };
