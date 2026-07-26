import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { MastersService } from './masters.service';
import { appUser } from '../common/app-user';
import { Roles } from '../auth/auth.decorators';
import type { MasterDef } from './masters.def';

@Roles('管理者')
@Controller('masters')
export class MastersController {
  constructor(private readonly masters: MastersService) {}

  // マスタ定義一覧（UI構築用）
  @Get()
  defs(): MasterDef[] {
    return this.masters.defs();
  }

  // 1マスタの全行
  @Get(':name')
  rows(@Param('name') name: string): Promise<Record<string, unknown>[]> {
    return this.masters.getRows(name);
  }

  // upsert（新規/更新）
  @Post(':name')
  upsert(
    @Param('name') name: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    return this.masters.upsertRow(name, appUser(req), body ?? {});
  }

  // 削除
  @Delete(':name/:id')
  remove(@Param('name') name: string, @Param('id') id: string, @Req() req: Request): Promise<{ ok: true }> {
    return this.masters.deleteRow(name, appUser(req), id);
  }
}
