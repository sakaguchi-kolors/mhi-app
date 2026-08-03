// API契約の型（フロント・バック共通の単一の源）

export interface PublicUser {
  userId: number;
  email: string;
  displayName: string;
  role: string;
  active: boolean;
}

export type Color = 'red' | 'yellow' | 'green';
export type CellStatus = 'done' | 'current' | 'wait';
export type GaicStatus = 'blue' | 'yellow' | 'red';
/** 外注工程の進捗フェーズ */
export type GaicPhase = 'wait_out' | 'out_done' | 'wait_in' | 'in_done';

export interface TimelineCell {
  shop: string;
  name: string;
  status: CellStatus;
  plan?: string;
  milestone?: boolean;
  mpassed?: boolean;
  mcolor?: Color;
  mdue?: string;
  gaic?: boolean;
  gorder?: string;
  gstat?: GaicStatus;
  gvendor?: string;
  /** 外注-持出待 / 持出済 / 納入待 / 持込済 */
  gphase?: GaicPhase;
  /** 外注持出日 MM/DD */
  gout?: string;
  /** 外注持込日 MM/DD */
  gin?: string;
  /** 納入予定日 MM/DD */
  geta?: string;
  /** 希望納期 MM/DD */
  greq?: string;
}

export interface Part {
  id: string;
  partNo: string;
  name: string;
  category: string;
  kishu: string;
  finalDue: string;
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
  inst: string;
  owner?: string;
  ownerDays?: number | null;
  trouble?: boolean;
  troubleDays?: number | null;
  memo?: string;
  note?: string;
  shelved?: boolean;
}

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
  /** CSVアップロード1ファイルあたりの上限（MB） */
  uploadMaxMb: number;
}

export interface IngestUploadResult {
  saved: boolean;
  key?: string;
  missing?: string[];
  files: IngestFile[];
  preflightOk: boolean;
}

export interface OwnerRow {
  user_id: number;
  email: string;
  displayName: string;
  role: string;
  active: boolean;
  kishus: string[];
}

export interface OwnersData {
  kishus: string[];
  owners: OwnerRow[];
}
