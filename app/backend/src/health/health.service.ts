import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BatchLockService } from '../etl/batch-lock.service';

export type HealthResult = {
  ok: boolean;
  db: 'up' | 'down';
  batch: 'running' | 'idle';
  status: 200 | 503;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly batchLock: BatchLockService,
  ) {}

  async check(): Promise<HealthResult> {
    const batch = this.batchLock.isLocked() ? 'running' : 'idle';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: 'up', batch, status: 200 };
    } catch {
      return { ok: false, db: 'down', batch, status: 503 };
    }
  }
}
