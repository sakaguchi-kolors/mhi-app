import { BadRequestException, Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PartsService } from './parts.service';
import { appUser } from '../common/app-user';
import type { Part } from '../common/types';

const MAX_TEXT_LEN = 2000;

@Controller('parts')
@ApiTags('parts')
@ApiCookieAuth('mhi_token')
export class PartsController {
  constructor(private readonly parts: PartsService) {}

  @Get()
  @ApiOperation({ summary: '部品一覧（計算済み進捗・色・フラグ付き）' })
  async list(): Promise<Part[]> {
    return this.parts.buildParts();
  }

  @Post(':id/owner')
  async setOwner(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { owner?: unknown; userId?: unknown },
  ): Promise<{ ok: true }> {
    const owner = body?.owner;
    if (owner != null && typeof owner !== 'string') throw new BadRequestException('owner must be a string');
    let userId: number | undefined;
    if (body?.userId != null) {
      userId = Number(body.userId);
      if (!Number.isFinite(userId)) throw new BadRequestException('userId must be a number');
    }
    await this.parts.setOwner(appUser(req), id, { owner: owner as string | undefined, userId });
    return { ok: true };
  }

  @Post(':id/trouble')
  async setTrouble(@Req() req: Request, @Param('id') id: string, @Body() body: { flagged?: unknown }): Promise<{ ok: true }> {
    await this.parts.setTrouble(appUser(req), id, !!body?.flagged);
    return { ok: true };
  }

  @Post(':id/shelved')
  async setShelved(@Req() req: Request, @Param('id') id: string, @Body() body: { flagged?: unknown }): Promise<{ ok: true }> {
    await this.parts.setShelved(appUser(req), id, !!body?.flagged);
    return { ok: true };
  }

  @Post(':id/memo')
  async setMemo(@Req() req: Request, @Param('id') id: string, @Body() body: { memo?: unknown }): Promise<{ ok: true }> {
    const memo = String(body?.memo ?? '');
    if (memo.length > MAX_TEXT_LEN) throw new BadRequestException(`メモは${MAX_TEXT_LEN}文字以内にしてください`);
    await this.parts.setMemo(appUser(req), id, memo);
    return { ok: true };
  }

  @Post(':id/note')
  async setNote(@Req() req: Request, @Param('id') id: string, @Body() body: { note?: unknown }): Promise<{ ok: true }> {
    const note = String(body?.note ?? '');
    if (note.length > MAX_TEXT_LEN) throw new BadRequestException(`対応メモは${MAX_TEXT_LEN}文字以内にしてください`);
    await this.parts.setNote(appUser(req), id, note);
    return { ok: true };
  }
}
