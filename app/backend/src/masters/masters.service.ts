// マスタ管理（定義駆動の汎用CRUD）。プロトタイプ server.ts のマスタ処理を移植。
// テーブル名・主キー・列は MASTERS 定義（サーバ管理）のみを埋め込み、値は必ずパラメータ化。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MASTERS, masterByName, type ColDef, type MasterDef } from './masters.def';

type Row = Record<string, unknown>;

function coerce(col: ColDef, v: unknown): unknown {
  if (v === '' || v === undefined || v === null) return null;
  if (col.type === 'number') return Number(v);
  if (col.type === 'bool') return v === true || v === 'true' || v === 'on';
  if (col.type === 'date') return String(v).slice(0, 10); // YYYY-MM-DD（SQL側で ::date）
  return String(v);
}

/** 主キー用のプレースホルダ（autoId=int / date列は明示キャスト） */
function pkParam(def: MasterDef, idx: number): string {
  if (def.autoId) return `$${idx}::int`;
  const col = def.columns.find((c) => c.key === def.pk);
  if (col?.type === 'date') return `$${idx}::date`;
  if (col?.type === 'number') return `$${idx}::numeric`;
  return `$${idx}`;
}

/** 列型に応じたプレースホルダ */
function colParam(col: ColDef, idx: number): string {
  if (col.type === 'date') return `$${idx}::date`;
  if (col.type === 'number') return `$${idx}::numeric`;
  if (col.type === 'bool') return `$${idx}::boolean`;
  return `$${idx}`;
}

/** date 列を YYYY-MM-DD に正規化（JSONのタイムゾーンずれ防止） */
function normalizeRow(def: MasterDef, row: Row | undefined): Row | undefined {
  if (!row) return row;
  const out: Row = { ...row };
  for (const c of def.columns) {
    if (c.type !== 'date') continue;
    const v = out[c.key];
    if (v == null) continue;
    if (v instanceof Date) {
      out[c.key] = `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
    } else {
      out[c.key] = String(v).slice(0, 10);
    }
  }
  // Decimal 等を JSON フレンドリーに
  for (const [k, v] of Object.entries(out)) {
    if (v != null && typeof v === 'object' && !(v instanceof Date) && 'toFixed' in (v as object)) {
      out[k] = String(v);
    }
  }
  return out;
}

function normalizeRows(def: MasterDef, rows: Row[]): Row[] {
  return rows.map((r) => normalizeRow(def, r)!);
}

@Injectable()
export class MastersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  defs(): MasterDef[] {
    return MASTERS;
  }

  private def(name: string): MasterDef {
    const d = masterByName(name);
    if (!d) throw new NotFoundException('unknown master');
    return d;
  }

  async getRows(name: string): Promise<Row[]> {
    const def = this.def(name);
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM ${def.table} ORDER BY ${def.pk}`);
    return normalizeRows(def, rows);
  }

  /** 新規/更新（自動採番キー／自然キーの両対応）。監査ログに記録する。 */
  async upsertRow(name: string, user: string, body: Row): Promise<Row> {
    const def = this.def(name);
    const colOf = (k: string): ColDef => def.columns.find((c) => c.key === k) ?? { key: k, label: k, type: 'text' };
    const pkVal = body[def.pk];
    const cols = def.columns.map((c) => c.key).filter((k) => k in body);

    try {
      if (def.autoId && pkVal != null && pkVal !== '') {
        // 自動採番の更新
        const before = normalizeRow(
          def,
          (
            await this.prisma.$queryRawUnsafe<Row[]>(
              `SELECT * FROM ${def.table} WHERE ${def.pk}=${pkParam(def, 1)}`,
              pkVal,
            )
          )[0],
        );
        const set = cols.map((k, i) => `${k}=${colParam(colOf(k), i + 2)}`).join(',');
        const vals = cols.map((k) => coerce(colOf(k), body[k]));
        const row = normalizeRow(
          def,
          (
            await this.prisma.$queryRawUnsafe<Row[]>(
              `UPDATE ${def.table} SET ${set} WHERE ${def.pk}=${pkParam(def, 1)} RETURNING *`,
              pkVal,
              ...vals,
            )
          )[0],
        )!;
        await this.audit.record(user, 'master.update', def.table, String(pkVal), before, row);
        return row;
      }
      if (def.autoId) {
        // 自動採番の新規
        const vals = cols.map((k) => coerce(colOf(k), body[k]));
        const ph = cols.map((k, i) => colParam(colOf(k), i + 1)).join(',');
        const row = normalizeRow(
          def,
          (
            await this.prisma.$queryRawUnsafe<Row[]>(
              `INSERT INTO ${def.table}(${cols.join(',')}) VALUES(${ph}) RETURNING *`,
              ...vals,
            )
          )[0],
        )!;
        await this.audit.record(user, 'master.insert', def.table, String(row?.[def.pk]), null, row);
        return row;
      }
      // 自然キー（key や shop 等）: ON CONFLICT で upsert
      const allCols = cols.includes(def.pk) ? cols : [def.pk, ...cols];
      const before = pkVal
        ? normalizeRow(
            def,
            (
              await this.prisma.$queryRawUnsafe<Row[]>(
                `SELECT * FROM ${def.table} WHERE ${def.pk}=${pkParam(def, 1)}`,
                pkVal,
              )
            )[0],
          )
        : null;
      const vals = allCols.map((k) => coerce(colOf(k), body[k]));
      const ph = allCols.map((k, i) => colParam(colOf(k), i + 1)).join(',');
      const upd = allCols
        .filter((k) => k !== def.pk)
        .map((k) => `${k}=EXCLUDED.${k}`)
        .join(',');
      const row = normalizeRow(
        def,
        (
          await this.prisma.$queryRawUnsafe<Row[]>(
            `INSERT INTO ${def.table}(${allCols.join(',')}) VALUES(${ph})
           ON CONFLICT (${def.pk}) DO UPDATE SET ${upd} RETURNING *`,
            ...vals,
          )
        )[0],
      )!;
      await this.audit.record(user, before ? 'master.update' : 'master.insert', def.table, String(pkVal), before, row);
      return row;
    } catch (e) {
      throw new BadRequestException(String(e));
    }
  }

  async deleteRow(name: string, user: string, id: string): Promise<{ ok: true }> {
    const def = this.def(name);
    try {
      const before = normalizeRow(
        def,
        (
          await this.prisma.$queryRawUnsafe<Row[]>(
            `SELECT * FROM ${def.table} WHERE ${def.pk}=${pkParam(def, 1)}`,
            id,
          )
        )[0],
      );
      await this.prisma.$executeRawUnsafe(`DELETE FROM ${def.table} WHERE ${def.pk}=${pkParam(def, 1)}`, id);
      await this.audit.record(user, 'master.delete', def.table, id, before, null);
      return { ok: true };
    } catch (e) {
      throw new BadRequestException(String(e));
    }
  }
}
