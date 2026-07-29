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
