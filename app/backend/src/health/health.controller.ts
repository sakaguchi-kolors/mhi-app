import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators';
import { HealthService } from './health.service';

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '死活確認（DB接続）' })
  async check(@Res({ passthrough: true }) res: Response): Promise<{ ok: boolean; db: 'up' | 'down'; batch: 'running' | 'idle' }> {
    const result = await this.health.check();
    res.status(result.status);
    return { ok: result.ok, db: result.db, batch: result.batch };
  }
}
