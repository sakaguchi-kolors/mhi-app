import { describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const prisma = { $queryRaw: vi.fn() };
  const batchLock = { isLocked: vi.fn() };

  const svc = () => new HealthService(prisma as never, batchLock as never);

  it('returns 200 when DB responds', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    batchLock.isLocked.mockReturnValue(false);
    await expect(svc().check()).resolves.toEqual({ ok: true, db: 'up', batch: 'idle', status: 200 });
  });

  it('returns 503 when DB fails and reports running batch', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));
    batchLock.isLocked.mockReturnValue(true);
    await expect(svc().check()).resolves.toEqual({ ok: false, db: 'down', batch: 'running', status: 503 });
  });
});
