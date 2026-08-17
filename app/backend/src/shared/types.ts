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
  /** 現在滞在中の SHOP コード。ヒートマップからの絞り込みに使う */
  currentShopCode?: string;
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

// ===== 工程ヒートマップ（フェーズ2） =====

/** 横軸の粒度 */
export type HeatUnit = 'week' | 'day';
/** arrival=その期間に着手予定の件数（流入） / occupancy=その期間に在席予定の件数（滞在） */
export type HeatMode = 'arrival' | 'occupancy';
/** 縦軸を SHOP でまとめるか、SHOP×JOB まで割るか、部品1件ずつにするか */
export type HeatGroupBy = 'shop' | 'job' | 'part';
/** none=0件（予定なし）。件数ありで母数未満は low（平常） */

export type HeatLevel = 'none' | 'low' | 'warn' | 'alert' | 'crit';

export interface HeatBucket {
  /** YYYY-MM-DD 期間開始（含む） */
  from: string;
  /** YYYY-MM-DD 期間終了（含む） */
  to: string;
  /** 見出し（週なら開始日の M/D） */
  label: string;
}

export interface HeatCell {
  /** 部品件数（OS_ID のユニーク数） */
  count: number;
  red: number;
  yellow: number;
  green: number;
  /** count / baseline。baseline は行ごとの平常値 */
  ratio: number;
  level: HeatLevel;
  /** セルに出す短い文字。groupBy=part のとき滞在する SHOP コード */
  label?: string;
}

export interface HeatRow {
  /** shop / shop::job / groupBy=part のとき os_id */
  key: string;
  shop: string;
  job?: string;
  name: string;
  /** 行の副見出し。工程なら SHOP/JOB、部品なら 部品番号 #インスタンス */
  sub: string;
  /** groupBy=part のときだけ入る。クリックで部品詳細に飛ぶため */
  osId?: string;
  /** 現在この工程で仕掛中の部品数 */
  wipCount: number;
  /** 仕掛中部品の平均滞留日数 */
  avgStagnant: number;
  /** 混雑判定の分母（この工程の平常時の件数＝件数0でない期間の平均） */
  baseline: number;
  /** baseline の根拠。将来 SHOP 別キャパマスタを入れたら 'capacity' を追加する */
  basis: 'mean';
  /** baseline の母数になった期間数。少ないほど判定の信頼度が低い */
  activeBuckets: number;
  peakRatio: number;
  peakLevel: HeatLevel;
  /** 期間内の延べ件数 */
  total: number;
  cells: HeatCell[];
}

export interface HeatThresholds {
  /** baseline の何倍で黄 */
  warn: number;
  /** 何倍で赤 */
  alert: number;
  /** 何倍で濃赤 */
  crit: number;
  /** この件数未満のセルは混雑判定せず平常とする */
  minCount: number;
  /** 平常時比とは別に、件数そのもので黄にする閾値。0 は無効 */
  absWarn: number;
  /** 件数そのもので赤にする閾値。0 は無効 */
  absAlert: number;
  /** 件数そのもので濃赤にする閾値。0 は無効 */
  absCrit: number;
}

export interface HeatmapResult {
  asOf: string;
  mode: HeatMode;
  unit: HeatUnit;
  groupBy: HeatGroupBy;
  thresholds: HeatThresholds;
  buckets: HeatBucket[];
  rows: HeatRow[];
  /** 表示上限で切る前の行数。rows.length より大きければ切られている */
  totalRows: number;
  /** 絞り込み用の選択肢 */
  kishus: string[];
  categories: string[];
}

export interface HeatCellPart {
  id: string;
  partNo: string;
  /** 製造インスタンスの識別子。同じ部品番号が並ぶため一覧と同じ表記で区別する */
  inst: string;
  name: string;
  kishu: string;
  color: Color;
  buffer: number;
  daysLeft: number;
  /** MM/DD */
  planStart?: string;
  /** MM/DD */
  planEnd?: string;
  owner: string;
  urgent: boolean;
  shortage: boolean;
  trouble: boolean;
}

export interface HeatCellDetail {
  shop: string;
  job?: string;
  name: string;
  from: string;
  to: string;
  /** 絞り込み前の総件数（parts は上限で切られることがある） */
  total: number;
  parts: HeatCellPart[];
}

// ---------- 実績リードタイム ----------
/** fixed=マスタ固定（現行） / actual=実績集計を採用 */
export type LtMode = 'fixed' | 'actual';
export type LtPercentile = 'p50' | 'p75' | 'p90';

export interface LtStatRow {
  shop: string;
  /** SHOP 名称（解決できなければ空） */
  name: string;
  /** サンプル数（工程間インターバルの件数） */
  n: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
  /** 参考：同 SHOP の Hs 中央値（時間）。LT ではない */
  hsMedian: number | null;
  /** m_shop_lt の手入力値。未登録は null（＝既定LTを使用） */
  manualLt: number | null;
  /** 実績からの推奨LT（日）。サンプル不足なら null */
  recommended: number | null;
  /** 現在バッファ計算に使われている値 */
  effective: number;
  /** effective の出どころ */
  source: 'manual' | 'actual' | 'default';
}

export interface LtStatsResult {
  /** 集計実行時刻。未集計は null */
  computedAt: string | null;
  mode: LtMode;
  percentile: LtPercentile;
  minSamples: number;
  /** m_param.SHOP_LT_DAYS */
  defaultLt: number;
  summary: {
    /** 集計できた SHOP 数 */
    shops: number;
    /** サンプル数の合計 */
    samples: number;
    /** 実績中央値が既定LTを超える SHOP 数（＝4日では足りない工程） */
    overDefaultShops: number;
    /** それらの SHOP が全サンプルに占める割合(%) */
    overDefaultSamplePct: number;
  };
  rows: LtStatRow[];
}

// ---------- 部品詳細：調整支援（Hs vs 想定LT） ----------
export interface AdjustSupportRow {
  shop: string;
  name: string;
  /** 圧縮セル内の Hs 合計（時間）。不明は null */
  hsHours: number | null;
  /** Hs ÷ 8h を 0.5日単位に丸めた値。Hs不明は null */
  hsLtDays: number | null;
  /** 現行設定の想定LT（日） */
  expectedLtDays: number;
  /** HsLT − 想定LT。マイナス＝前倒し余地。Hs不明は 0 */
  diffDays: number;
}

export interface AdjustSupport {
  /** 現行設定で進んだ場合の遅延日数（完成予測 − 依頼納期）。マイナスは前倒し */
  delayDays: number;
  /** 後続工程の前倒し余裕合計（想定LT − HsLT） */
  recoverableDays: number;
  /** リカバリ後も残る遅延。マイナスは納期内 */
  postRecoveryDelayDays: number;
  /** リカバリ後の完成予測 MM/DD。納期不明は null */
  postRecoveryDate: string | null;
  /** 依頼納期 MM/DD */
  finalDue: string | null;
  hoursPerDay: number;
  rows: AdjustSupportRow[];
}

// ---------- 部品詳細：後続SHOP混雑 ----------
export type CongestionLevel = 'green' | 'yellow' | 'red';

export interface PartCongestionBatting {
  id: string;
  partNo: string;
  inst: string;
  name: string;
  color: Color;
  buffer: number;
}

export interface PartCongestionStep {
  step: number;
  shop: string;
  name: string;
  /** そのSHOPをまだ通る未完了部品数 */
  started: number;
  red: number;
  yellow: number;
  green: number;
  redPct: number;
  yellowPct: number;
  greenPct: number;
  level: CongestionLevel;
  /** 優先度の高いバッティング候補（自分以外） */
  batting: PartCongestionBatting[];
  /** リストに出し切らなかった赤の件数 */
  battingRedMore: number;
}

export interface PartCongestion {
  osId: string;
  /** カード色の件数閾値 */
  thresholds: { yellow: number; red: number };
  steps: PartCongestionStep[];
}
