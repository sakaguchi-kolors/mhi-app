import type { ShopMasterRow } from './etl-types';

export type ShopMasterSource = 'shop_job' | 'flexsche';

export interface ShopMasterCsvRow {
  shop: string;
  job: string;
  name: string;
  machine: string;
}

export interface FlexShopJob {
  shop: string;
  job: string;
}

/** SHOP_JOBマスタ行 + FLEXSCHE にのみ存在する shop::job をマージして t_shop_master 用行を生成 */
export function buildShopMasterRows(
  masterRows: ShopMasterCsvRow[],
  flexShopJobs: FlexShopJob[],
  octName: Map<string, string>,
): ShopMasterRow[] {
  const map = new Map<string, ShopMasterRow>();

  for (const r of masterRows) {
    if (!r.shop) continue;
    const key = shopMasterKey(r);
    map.set(key, {
      shop: r.shop,
      job: r.job,
      name: r.name || null,
      machine: r.machine || null,
      source: 'shop_job',
    });
  }

  for (const { shop, job } of flexShopJobs) {
    if (!shop) continue;
    const key = shopMasterKey({ shop, job });
    if (map.has(key)) continue;
    map.set(key, {
      shop,
      job,
      name: octName.get(shop) ?? null,
      machine: null,
      source: 'flexsche',
    });
  }

  return [...map.values()].sort((a, b) => {
    const sa = `${a.shop}::${a.job}`;
    const sb = `${b.shop}::${b.job}`;
    return sa.localeCompare(sb, 'ja');
  });
}

export function collectFlexShopJobs(rows: FlexShopJob[]): FlexShopJob[] {
  const seen = new Set<string>();
  const out: FlexShopJob[] = [];
  for (const { shop, job } of rows) {
    if (!shop) continue;
    const key = `${shop}::${job}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ shop, job });
  }
  return out;
}

export function shopMasterKey(row: Pick<ShopMasterRow, 'shop' | 'job'>): string {
  return `${row.shop}::${row.job}`;
}

export function shopMasterEqual(a: ShopMasterRow, b: ShopMasterRow): boolean {
  return a.name === b.name && a.machine === b.machine && a.source === b.source;
}

export function toShopMasterRow(r: {
  shop: unknown;
  job: unknown;
  name: unknown;
  machine: unknown;
  source?: unknown;
}): ShopMasterRow {
  const source = String(r.source ?? 'shop_job');
  return {
    shop: String(r.shop ?? ''),
    job: String(r.job ?? ''),
    name: r.name == null ? null : String(r.name),
    machine: r.machine == null ? null : String(r.machine),
    source: source === 'flexsche' ? 'flexsche' : 'shop_job',
  };
}

export function buildNameResolver(
  nameByShopJob: Map<string, string>,
  nameByShop: Map<string, string>,
  octName: Map<string, string>,
): (shop: string, job: string) => string {
  return (shop: string, job: string): string =>
    nameByShopJob.get(`${shop}::${job}`) ?? nameByShop.get(shop) ?? octName.get(shop) ?? `Shop ${shop}`;
}

export function buildOctNameMap(octFreq: Map<string, Map<string, number>>): Map<string, string> {
  const octName = new Map<string, string>();
  for (const [shop, m] of octFreq) {
    let best = '';
    let bestN = -1;
    for (const [proc, n] of m) if (n > bestN) {
      best = proc;
      bestN = n;
    }
    octName.set(shop, best);
  }
  return octName;
}

export const SHOP_MASTER_SOURCE_LABEL: Record<ShopMasterSource, string> = {
  shop_job: 'SHOP_JOB',
  flexsche: 'FLEXSCHE',
};
