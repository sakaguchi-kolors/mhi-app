// API契約の型（バックエンド backend/src/common/types.ts と一致させる単一の源）。
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
  owner?: string;
  ownerDays?: number | null;
  trouble?: boolean;
  troubleDays?: number | null;
  memo?: string; // 困りごとメモ
  note?: string; // 対応メモ
  shelved?: boolean; // 一旦置いておく（通常一覧から非表示）
}

// マスタ定義（サーバの /api/masters が返す形）
export interface ColDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'bool' | 'select' | 'date';
  options?: string[];
  readonly?: boolean;
  required?: boolean;
}
export interface MasterDef {
  name: string;
  table: string;
  label: string;
  group: 'edit' | 'import';
  pk: string;
  autoId: boolean;
  columns: ColDef[];
  note?: string;
}
export interface Meta {
  asOf: string;
  owners: string[];
  dueSource: string;
  stagnantThreshold: number;
}
export interface AuditRow {
  app_user: string;
  action: string;
  target: string;
  ref: string;
  at: string;
}
export interface AuditDetailRow extends AuditRow {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
export interface AuditSearchResult {
  items: AuditDetailRow[];
  total: number;
  page: number;
  pageSize: number;
}

// 取込（指定フォルダ→UI手動取込）
export interface IngestFile {
  name: string;
  exists: boolean;
  size: number;
  mtime: string | null;
  encoding: string | null;
  requiredOk: boolean;
  missing: string[];
  error: string | null;
}
export interface IngestResult {
  parts: number;
  timeline: number;
  colors: { red: number; yellow: number; green: number };
}
export interface IngestJob {
  id: string;
  user: string;
  state: 'running' | 'done' | 'error';
  startedAt: string;
  finishedAt: string | null;
  elapsedMs: number | null;
  result: IngestResult | null;
  error: string | null;
}
export interface IngestInfo {
  dir: string;
  files: IngestFile[];
  preflightOk: boolean;
  job: IngestJob | null;
}

// 担当者×機種（ログインユーザー基準）
export interface OwnerRow {
  user_id: number;
  email: string;
  displayName: string;
  role: string;
  active: boolean;
  kishus: string[];
}
export interface OwnersData {
  kishus: string[];   // 全機種
  owners: OwnerRow[];
}
