import { BadRequestException, Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { OwnersService, type OwnersData } from './owners.service';
import { appUser } from '../common/app-user';
import { Roles } from '../auth/auth.decorators';

@Roles('管理者')
@Controller('owners')
@ApiTags('owners')
@ApiCookieAuth('mhi_token')
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  // 担当者一覧（各人の担当機種つき）＋全機種リスト
  @Get()
  getOwners(): Promise<OwnersData> {
    return this.owners.getOwners();
  }

  // 担当者（ログインユーザー）の担当機種トグル（ON=追加 / OFF=削除）。:id は user_id
  @Post(':id/kishu')
  async toggle(
    @Param('id') id: string,
    @Body() body: { kishu?: unknown; on?: unknown },
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const userId = Number(id);
    const kishu = String(body?.kishu ?? '');
    if (!userId || !kishu) throw new BadRequestException('user id and kishu required');
    await this.owners.toggleKishu(userId, kishu, !!body?.on, appUser(req));
    return { ok: true };
  }
}
