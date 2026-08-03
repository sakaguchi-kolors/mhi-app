export interface ColorCounts {
  green: number;
  yellow: number;
  red: number;
}

export interface EtlSummary {
  parts: number;
  timeline: number;
  colors?: ColorCounts;
}

export type ShopMasterRow = { shop: string; job: string; name: string | null; machine: string | null };

export interface Agg {
  partNo: string;
  partName: string;
  kishu: string;
  urgent: boolean;
  rows: import('./etl-routing.types').RoutingRow[];
}
