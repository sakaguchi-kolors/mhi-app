// マスタ CRUD の Prisma 実装（masters.service から利用）
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { milestoneRowKey, parseMilestoneRowKey } from './milestone-mark.util';
import { DUE_SOURCE_KINDS, type DueSourceKind } from '../etl/etl-compute.util';
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
    if (key === 'cal_date') return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
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

  /** SHOP_JOBマスタ全行 + m_milestone のフラグをマージ */
  private async findMilestoneRows(def: MasterDef): Promise<MasterRow[]> {
    const [shops, marks] = await Promise.all([
      this.prisma.shopMaster.findMany({ orderBy: [{ shop: 'asc' }, { job: 'asc' }] }),
      this.prisma.milestone.findMany(),
    ]);
    const markMap = new Map(marks.map((m) => [milestoneRowKey(m.shop, m.job), m]));
    return shops.map((sm) => {
      const shop = String(sm.shop);
      const job = String(sm.job);
      const key = milestoneRowKey(shop, job);
      const m = markMap.get(key);
      const record: Record<string, unknown> = {
        shop,
        job,
        name: sm.name,
        isMilestone: m?.isMilestone ?? false,
        gaic: m?.gaic ?? false,
        shop_job: key,
        createdAt: m?.createdAt,
        createdBy: m?.createdBy,
        updatedAt: m?.updatedAt,
        updatedBy: m?.updatedBy,
      };
      return modelToRow(def, record);
    });
  }

  /** 全機種 + 設定済み優先順位をマージ */
  private async findKishuDuePriorityRows(def: MasterDef): Promise<MasterRow[]> {
    const [kishus, priorities] = await Promise.all([
      this.prisma.kishu.findMany({ where: { active: true }, orderBy: { kishu: 'asc' } }),
      this.prisma.kishuDuePriority.findMany(),
    ]);
    const pmap = new Map(priorities.map((p) => [p.kishu, p]));
    return kishus.map((k) => {
      const p = pmap.get(k.kishu);
      const record: Record<string, unknown> = p
        ? { ...p, configured: true }
        : { kishu: k.kishu, priority1: '', priority2: '', priority3: '', configured: false };
      return modelToRow(def, record);
    });
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
        const isMs = body.is_milestone === true || body.is_milestone === 'true';
        const gaic = body.gaic === true || body.gaic === 'true';
        const key = milestoneRowKey(shop, job);
        if (!isMs && !gaic) {
          await this.prisma.milestone.deleteMany({ where: { shop, job } });
          const sm = await this.prisma.shopMaster.findUnique({ where: { shop_job: { shop, job } } });
          return {
            shop,
            job,
            shop_job: key,
            name: sm?.name ?? body.name ?? '',
            is_milestone: false,
            gaic: false,
          };
        }
        const row = await this.prisma.milestone.upsert({
          where: { shop_job: { shop, job } },
          create: {
            shop,
            job,
            isMilestone: isMs,
            gaic,
            createdAt: now,
            createdBy: user,
            updatedAt: now,
            updatedBy: user,
          },
          update: {
            isMilestone: isMs,
            gaic,
            updatedAt: now,
            updatedBy: user,
          },
        });
        const sm = await this.prisma.shopMaster.findUnique({ where: { shop_job: { shop, job } } });
        const record: Record<string, unknown> = {
          ...row,
          name: sm?.name ?? body.name ?? '',
          shop_job: key,
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
        const [p1, p2, p3] = validateKishuDuePriority(body);
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
        return modelToRow(def, { ...row, configured: true } as Record<string, unknown>);
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
        await this.prisma.kishuDuePriority.delete({ where: { kishu: id } });
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
