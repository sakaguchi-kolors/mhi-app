// APIが返す形（モック v13 の PARTS 要素と一致させる）。フロントと共有する契約の単一の源。

export type Color = 'red' | 'yellow' | 'green';
export type CellStatus = 'done' | 'current' | 'wait';
export type GaicStatus = 'blue' | 'yellow' | 'red';

export interface TimelineCell {
  shop: string;
  name: string;
  status: CellStatus;
  plan?: string; // 計画完了日 MM/DD
  milestone?: boolean;
  mpassed?: boolean;
  mcolor?: Color;
  mdue?: string; // MM/DD
  gaic?: boolean;
  gorder?: string;
  gstat?: GaicStatus;
  gvendor?: string; // 外注先名（m_vendor 由来。表示用）
}

export interface Part {
  id: string; // os_id
  partNo: string;
  name: string;
  category: string;
  kishu: string; // 機種(型式)。担当割り当てのキー
  finalDue: string; // YYYY/MM/DD
  daysLeft: number;
  totalShops: number;
  doneShops: number;
  remainShops: number;
  buffer: number;
  color: Color;
  stagnant: number;
  urgent: boolean;
  shortage: boolean;
  currentShop: string;
  timeline: TimelineCell[];
  inst: string; // 末尾の製造インスタンス番号（表示用）
  // アプリ固有（③テーブル由来）
  owner?: string;
  ownerDays?: number | null;
  trouble?: boolean;
  troubleDays?: number | null;
  memo?: string; // 困りごとメモ
  note?: string; // 対応メモ
  shelved?: boolean; // 一旦置いておく（通常一覧から非表示）
}

// ETL内部で扱う工程行（1工程＝1行）
export interface RoutingRow {
  osId: string;
  seqMain: number;
  seqSub: number;
  seqLabel: string;
  shop: string;
  job: string;
  planStart: Date | null;
  planEnd: Date | null;
  wip: boolean;
  materialStatus: string;
  outDate: Date | null;
  inDate: Date | null;
  etaDate: Date | null;
  orderNo: string;
}
