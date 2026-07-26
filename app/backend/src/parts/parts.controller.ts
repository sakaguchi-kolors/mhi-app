import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PartsService } from './parts.service';
import type { Part } from '../common/types';

@Controller('parts')
export class PartsController {
  constructor(private readonly parts: PartsService) {}

  @Get()
  async list(): Promise<Part[]> {
    return this.parts.buildParts();
  }

  @Post(':id/owner')
  async setOwner(@Param('id') id: string, @Body() body: { owner?: unknown }): Promise<{ ok: true }> {
    const owner = body?.owner;
    if (owner != null && typeof owner !== 'string') throw new BadRequestException('owner must be a string');
    await this.parts.setOwner(id, (owner as string) ?? '未割当');
    return { ok: true };
  }

  @Post(':id/trouble')
  async setTrouble(@Param('id') id: string, @Body() body: { flagged?: unknown }): Promise<{ ok: true }> {
    await this.parts.setTrouble(id, !!body?.flagged);
    return { ok: true };
  }

  @Post(':id/shelved')
  async setShelved(@Param('id') id: string, @Body() body: { flagged?: unknown }): Promise<{ ok: true }> {
    await this.parts.setShelved(id, !!body?.flagged);
    return { ok: true };
  }

  @Post(':id/memo')
  async setMemo(@Param('id') id: string, @Body() body: { memo?: unknown }): Promise<{ ok: true }> {
    await this.parts.setMemo(id, String(body?.memo ?? ''));
    return { ok: true };
  }

  @Post(':id/note')
  async setNote(@Param('id') id: string, @Body() body: { note?: unknown }): Promise<{ ok: true }> {
    await this.parts.setNote(id, String(body?.note ?? ''));
    return { ok: true };
  }
}
