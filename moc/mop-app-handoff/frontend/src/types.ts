// バックエンドの型をそのまま共有（API契約の単一の源）。
export type { Part, TimelineCell, Color, GaicStatus, CellStatus } from '../../src/types';

// マスタ定義（サーバの /api/masters が返す形）
export interface ColDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'bool' | 'select' | 'date';
  options?: string[];
  readonly?: boolean;
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
}
export interface AuditRow {
  app_user: string;
  action: string;
  target: string;
  ref: string;
  at: string;
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

// 担当者×機種（担当者マスタUI）
export interface OwnerRow {
  owner_id: number;
  name: string;
  ad_account: string | null;
  role: string;
  active: boolean;
  kishus: string[]; // この担当者が担当する機種
}
export interface OwnersData {
  kishus: string[];   // 全機種
  owners: OwnerRow[];
}
