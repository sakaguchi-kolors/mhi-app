import { describe, expect, it, vi } from 'vitest';
import { AsOfService } from './as-of.service';
import { localYmd } from '../shared/dates';

describe('AsOfService', () => {
  const prisma = {
    param: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const config = { asOfEnv: null as string | null };

  const svc = () => new AsOfService(prisma as never, config as never);

  it('forIngest uses today in local timezone', () => {
    const { ymd, date } = svc().forIngest();
    expect(ymd).toBe(localYmd());
    expect(date.getFullYear()).toBe(new Date().getFullYear());
  });

  it('getEffective prefers stored value over env', async () => {
    config.asOfEnv = '2026-07-08';
    prisma.param.findUnique.mockResolvedValueOnce({ value: '2026-07-29' });
    await expect(svc().getEffective()).resolves.toBe('2026-07-29');
  });

  it('getEffective falls back to env then today', async () => {
    config.asOfEnv = '2026-07-08';
    prisma.param.findUnique.mockResolvedValueOnce(null);
    await expect(svc().getEffective()).resolves.toBe('2026-07-08');

    config.asOfEnv = null;
    prisma.param.findUnique.mockResolvedValueOnce(null);
    await expect(svc().getEffective()).resolves.toBe(localYmd());
  });

  it('persist upserts m_param AS_OF', async () => {
    await svc().persist('2026-07-29', 'tester');
    expect(prisma.param.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'AS_OF' },
        create: expect.objectContaining({ value: '2026-07-29', createdBy: 'tester' }),
        update: expect.objectContaining({ value: '2026-07-29', updatedBy: 'tester' }),
      }),
    );
  });
});
