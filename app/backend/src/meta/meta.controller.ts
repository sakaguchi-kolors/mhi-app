import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetaService } from './meta.service';
import type { Meta } from '../shared/types';

@Controller('meta')
@ApiTags('meta')
@ApiCookieAuth('mhi_token')
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  @Get()
  @ApiOperation({ summary: '基準日・担当者候補・DUE_SOURCE' })
  getMeta(): Promise<Meta> {
    return this.meta.getMeta();
  }
}
