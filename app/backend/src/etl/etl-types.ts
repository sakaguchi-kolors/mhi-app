export interface EtlSummary {
  parts: number;
  timeline: number;
}

export type ShopMasterRow = { shop: string; job: string; name: string | null; machine: string | null };

export interface Agg {
  partNo: string;
  partName: string;
  kishu: string;
  urgent: boolean;
  rows: import('./etl-routing.types').RoutingRow[];
}
