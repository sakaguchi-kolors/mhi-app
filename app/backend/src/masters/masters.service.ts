// マスタ管理（定義駆動の汎用CRUD）。Prisma リポジトリ経由で型安全にアクセス。
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MASTERS, masterByName, type ColDef, type MasterDef } from './masters.def';
import { MastersRepository, type MasterRow } from './masters.repository';

function validateBody(def: MasterDef, body: MasterRow): void {
  const isBlank = (v: unknown) => v == null || v === '' || (typeof v === 'string' && !v.trim());
  for (const c of def.columns) {
    if (!c.required) continue;
    if (isBlank(body[c.key])) throw new BadRequestException(`${c.label}を入力してください`);
  }
  if (!def.autoId && isBlank(body[def.pk])) {
    const pkCol = def.columns.find((c) => c.key === def.pk);
    throw new BadRequestException(`${pkCol?.label ?? '主キー'}を入力してください`);
  }
  if (def.name === 'category' && body.pattern != null) {
    const pattern = String(body.pattern);
    if (pattern.length > 200) throw new BadRequestException('パターンは200文字以内にしてください');
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern);
    } catch {
      throw new BadRequestException('正規表現の形式が正しくありません');
    }
  }
}

@Injectable()
export class MastersService {
  private readonly logger = new Logger(MastersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly repo: MastersRepository,
  ) {}

  defs(): MasterDef[] {
    return MASTERS;
  }

  private def(name: string): MasterDef {
    const d = masterByName(name);
    if (!d) throw new NotFoundException('unknown master');
    return d;
  }

  async getRows(name: string): Promise<MasterRow[]> {
    return this.repo.findAll(this.def(name));
  }

  async upsertRow(name: string, user: string, body: MasterRow): Promise<MasterRow> {
    const def = this.def(name);
    validateBody(def, body);
    const pkVal = body[def.pk];
    const before = pkVal != null && pkVal !== '' ? await this.repo.findOne(def, pkVal) : null;
    try {
      const row = await this.repo.upsert(def, user, body);
      await this.audit.record(
        user,
        before ? 'master.update' : 'master.insert',
        def.table,
        String(row[def.pk]),
        before,
        row,
      );
      return row;
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.logger.error(e);
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') throw new BadRequestException('同じキーのデータが既に存在します');
        if (e.code === 'P2025') throw new BadRequestException('更新対象が見つかりません');
      }
      throw e;
    }
  }

  async deleteRow(name: string, user: string, id: string): Promise<{ ok: true }> {
    const def = this.def(name);
    if (def.autoId && !/^\d+$/.test(id)) {
      throw new BadRequestException('削除対象のIDが不正です');
    }
    try {
      const before = await this.repo.findOne(def, id);
      await this.repo.delete(def, id);
      await this.audit.record(user, 'master.delete', def.table, id, before, null);
      return { ok: true };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.logger.error(e);
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') throw new BadRequestException('削除対象が見つかりません');
      }
      throw e;
    }
  }
}

// re-export for backward compat in tests
export type { ColDef, MasterDef };
