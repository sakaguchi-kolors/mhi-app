import type { ShopMasterRow } from './etl-types';

export function shopMasterKey(row: ShopMasterRow): string {
  return `${row.shop}::${row.job}`;
}

export function shopMasterEqual(a: ShopMasterRow, b: ShopMasterRow): boolean {
  return a.name === b.name && a.machine === b.machine;
}

export function toShopMasterRow(r: { shop: unknown; job: unknown; name: unknown; machine: unknown }): ShopMasterRow {
  return {
    shop: String(r.shop ?? ''),
    job: String(r.job ?? ''),
    name: r.name == null ? null : String(r.name),
    machine: r.machine == null ? null : String(r.machine),
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
