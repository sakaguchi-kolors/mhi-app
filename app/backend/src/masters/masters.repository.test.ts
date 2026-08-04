import { describe, expect, it } from 'vitest';
import { modelToRow } from '../masters/masters.repository';
import { MASTERS } from '../masters/masters.def';

describe('masters.repository modelToRow', () => {
  it('maps prisma fields to API column names', () => {
    const def = MASTERS.find((d) => d.name === 'shop_lt')!;
    const row = modelToRow(def, {
      shop: 'S1',
      ltDays: 5,
      active: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      createdBy: 'admin',
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      updatedBy: 'admin',
    });
    expect(row.shop).toBe('S1');
    expect(row.lt_days).toBe(5);
    expect(row.active).toBe(true);
    expect(row.created_by).toBe('admin');
  });

  it('serializes calendar date as YYYY-MM-DD', () => {
    const def = MASTERS.find((d) => d.name === 'calendar')!;
    const row = modelToRow(def, {
      calDate: new Date('2026-07-15T00:00:00Z'),
      isWorkday: false,
      note: null,
    });
    expect(row.cal_date).toBe('2026-07-15');
    expect(row.is_workday).toBe(false);
  });

  it('maps milestone flags to API columns', () => {
    const def = MASTERS.find((d) => d.name === 'milestone')!;
    const row = modelToRow(def, {
      shop: '7P31',
      job: '001',
      name: '検査',
      source: 'flexsche',
      isMilestone: true,
      gaic: false,
      shop_job: '7P31::001',
    });
    expect(row.shop).toBe('7P31');
    expect(row.job).toBe('001');
    expect(row.source).toBe('flexsche');
    expect(row.is_milestone).toBe(true);
    expect(row.gaic).toBe(false);
    expect(row.shop_job).toBe('7P31::001');
  });
});
