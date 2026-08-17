import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { LtService } from './lt.service';
import { appUser } from '../common/app-user';
import { Roles } from '../auth/auth.decorators';
import type { LtStatsResult } from '../shared/types';

@Controller('lt')
@ApiTags('lt')
@ApiCookieAuth('mhi_token')
export class LtController {
  constructor(private readonly lt: LtService) {}

  @Get('stats')
  @ApiOperation({ summary: 'SHOP別 実績リードタイム集計（現行設定との比較つき）' })
  stats(): Promise<LtStatsResult> {
    return this.lt.getStats();
  }

  @Post('recompute')
  @Roles('管理者')
  @ApiOperation({ summary: '実績リードタイムを集計し直す' })
  recompute(): Promise<{ shops: number; samples: number }> {
    return this.lt.recompute();
  }

  @Post('adopt')
  @Roles('管理者')
  @ApiOperation({ summary: '推奨値を m_shop_lt に反映する（shops 未指定なら全件）' })
  adopt(@Body() body: { shops?: string[] } | undefined, @Req() req: Request): Promise<{ updated: number }> {
    const shops = Array.isArray(body?.shops) ? body.shops.map(String) : undefined;
    return this.lt.adopt(appUser(req), shops);
  }
}
