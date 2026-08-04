import { describe, expect, it } from 'vitest';
import { buildShopMasterRows, collectFlexShopJobs, shopMasterEqual } from './etl-shop-master.util';

describe('buildShopMasterRows', () => {
  const octName = new Map([['8209', 'サーメテルWコ－ティング'], ['7P31', '検査']]);

  it('uses SHOP_JOB rows as primary', () => {
    const rows = buildShopMasterRows(
      [{ shop: '7P31', job: '001', name: '検査（素材確認）', machine: 'M1' }],
      [],
      octName,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ shop: '7P31', job: '001', source: 'shop_job', name: '検査（素材確認）' });
  });

  it('supplements FLEXSCHE-only shop::job with flexsche source', () => {
    const rows = buildShopMasterRows(
      [{ shop: '7P31', job: '001', name: '検査', machine: '' }],
      [{ shop: '8209', job: '001' }],
      octName,
    );
    expect(rows).toHaveLength(2);
    const flex = rows.find((r) => r.shop === '8209');
    expect(flex).toMatchObject({
      shop: '8209',
      job: '001',
      source: 'flexsche',
      name: 'サーメテルWコ－ティング',
      machine: null,
    });
  });

  it('does not override SHOP_JOB when same shop::job exists in FLEXSCHE', () => {
    const rows = buildShopMasterRows(
      [{ shop: '8209', job: '001', name: 'マスタ名称', machine: '' }],
      [{ shop: '8209', job: '001' }],
      octName,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'shop_job', name: 'マスタ名称' });
  });
});

describe('collectFlexShopJobs', () => {
  it('deduplicates shop::job pairs', () => {
    const out = collectFlexShopJobs([
      { shop: '8209', job: '001' },
      { shop: '8209', job: '001' },
      { shop: '8209', job: '002' },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('shopMasterEqual', () => {
  it('compares source', () => {
    const a = { shop: 'S', job: 'J', name: 'n', machine: null, source: 'shop_job' as const };
    const b = { ...a, source: 'flexsche' as const };
    expect(shopMasterEqual(a, b)).toBe(false);
  });
});
