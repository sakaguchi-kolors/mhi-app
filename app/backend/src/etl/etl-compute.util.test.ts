import { describe, expect, it } from 'vitest';
import { flexMaxFromRows, resolveFinalDue } from './etl-compute.util';

describe('etl-compute.util', () => {
  it('flexMaxFromRows picks latest planEnd', () => {
    const d1 = new Date('2026-01-01');
    const d2 = new Date('2026-03-01');
    expect(flexMaxFromRows([{ planEnd: d1 }, { planEnd: d2 }, { planEnd: null }])).toEqual(d2);
  });

  it('resolveFinalDue prefers pbs when dueSource=pbs', () => {
    const flex = new Date('2026-01-01');
    const pbs = new Date('2026-06-30');
    expect(resolveFinalDue('pbs', flex, pbs)).toEqual(pbs);
    expect(resolveFinalDue('flexsche', flex, pbs)).toEqual(flex);
  });

  it('resolveFinalDue falls back when primary is null', () => {
    const pbs = new Date('2026-06-30');
    expect(resolveFinalDue('flexsche', null, pbs)).toEqual(pbs);
    expect(resolveFinalDue('pbs', null, pbs)).toEqual(pbs);
  });
});
