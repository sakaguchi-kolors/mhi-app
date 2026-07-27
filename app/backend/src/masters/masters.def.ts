// マスタの定義・既定シード（CRUD/UI と 算出 の両方が参照する単一の源のうち「定義」部分）
// 算出用の読込は masters.util.ts（loadMasters）。

// ---------- UI/CRUD 用のマスタ定義 ----------
export type ColType = 'text' | 'number' | 'bool' | 'select' | 'date';
export interface ColDef {
  key: string;
  label: string;
  type: ColType;
  options?: string[];
  readonly?: boolean;
  required?: boolean;
}
export interface MasterDef {
  name: string; // URLスラグ
  table: string;
  label: string; // 画面表示名
  group: 'edit' | 'import';
  pk: string; // 主キー列
  autoId: boolean; // 主キーが自動採番か
  columns: ColDef[];
  note?: string;
}

export const MASTERS: MasterDef[] = [
  {
    name: 'param',
    table: 'm_param',
    label: 'パラメータ設定',
    group: 'edit',
    pk: 'key',
    autoId: false,
    note: '緊急度の色・所要日数・納期の採用元など。編集後は「再計算」で反映。',
    columns: [
      { key: 'key', label: 'キー', type: 'text', readonly: true },
      { key: 'value', label: '値', type: 'text', required: true },
      { key: 'description', label: '説明', type: 'text' },
    ],
  },
  {
    name: 'milestone',
    table: 'm_milestone',
    label: '中間マイルストン定義',
    group: 'edit',
    pk: 'id',
    autoId: true,
    note: 'タイムライン上で検査マイルストンとみなす工程の条件。',
    columns: [
      { key: 'match_type', label: '種別', type: 'select', options: ['shop', 'shop_prefix', 'name_contains'], required: true },
      { key: 'pattern', label: 'パターン', type: 'text', required: true },
      { key: 'label', label: '名称(任意)', type: 'text' },
      { key: 'active', label: '有効', type: 'bool' },
    ],
  },
  {
    name: 'shop_lt',
    table: 'm_shop_lt',
    label: 'Shop別標準LT',
    group: 'import',
    pk: 'shop',
    autoId: false,
    note: '未登録Shopは既定LT(param)を使用。登録すると残Shop所要日数の計算が精緻化。',
    columns: [
      { key: 'shop', label: 'SHOP', type: 'text', required: true },
      { key: 'lt_days', label: '標準LT(日)', type: 'number', required: true },
      { key: 'active', label: '有効', type: 'bool' },
    ],
  },
  {
    name: 'calendar',
    table: 'm_calendar',
    label: '稼働日カレンダー',
    group: 'import',
    pk: 'cal_date',
    autoId: false,
    note: '休日を登録すると残日数から除外。未登録＝暦日。',
    columns: [
      { key: 'cal_date', label: '日付(YYYY-MM-DD)', type: 'date', required: true },
      { key: 'is_workday', label: '稼働日?', type: 'bool' },
      { key: 'note', label: '摘要', type: 'text' },
    ],
  },
  {
    name: 'vendor',
    table: 'm_vendor',
    label: '外注先',
    group: 'import',
    pk: 'order_prefix',
    autoId: false,
    note: '注文番号の前方一致で外注先名を表示（再計算不要・一覧再読込で反映）。',
    columns: [
      { key: 'order_prefix', label: '注文番号プレフィックス', type: 'text', required: true },
      { key: 'vendor_name', label: '外注先名', type: 'text', required: true },
      { key: 'return_lt', label: '標準戻りLT(日)', type: 'number' },
      { key: 'active', label: '有効', type: 'bool' },
    ],
  },
  {
    name: 'category',
    table: 'm_category',
    label: '完成品分類',
    group: 'import',
    pk: 'id',
    autoId: true,
    note: '部品番号の正規表現→分類。priority昇順で最初の一致を採用。未一致は「その他」。',
    columns: [
      { key: 'pattern', label: 'パターン(正規表現)', type: 'text', required: true },
      { key: 'category', label: '分類', type: 'text', required: true },
      { key: 'priority', label: '優先度', type: 'number' },
      { key: 'active', label: '有効', type: 'bool' },
    ],
  },
];

export const masterByName = (name: string): MasterDef | undefined => MASTERS.find((m) => m.name === name);

// ---------- 既定シード（現状挙動を完全再現） ----------
export const DEFAULT_PARAMS: { key: string; value: string; description: string }[] = [
  { key: 'SHOP_LT_DAYS', value: '4', description: '1Shopあたりの既定所要日数（バッファ計算）' },
  { key: 'MILESTONE_LT_DAYS', value: '5', description: 'マイルストン期日の逆算係数（日/Shop）' },
  { key: 'STAGNANT_THRESHOLD', value: '10', description: 'レッドフラッグの滞留日数閾値' },
  { key: 'BUFFER_GREEN', value: '1', description: 'バッファがこの値以上で緑' },
  { key: 'BUFFER_YELLOW', value: '0', description: 'バッファがこの値以上（緑未満）で黄。未満は赤' },
  { key: 'DUE_SOURCE', value: 'flexsche', description: '最終納期の採用元 flexsche/pbs（未決論点）' },
];

export const DEFAULT_MILESTONES: { match_type: string; pattern: string; label: string }[] = [
  { match_type: 'name_contains', pattern: '検査', label: '検査' },
  { match_type: 'name_contains', pattern: '試験', label: '試験' },
  { match_type: 'name_contains', pattern: 'バランステスト', label: 'バランステスト' },
  { match_type: 'shop_prefix', pattern: '7P3', label: '検査系Shop' },
  { match_type: 'shop', pattern: '7P42', label: '検査（バランス）' },
];

export const DEFAULT_CATEGORIES: { pattern: string; category: string; priority: number }[] = [
  { pattern: '^V', category: '推進系ユニット', priority: 10 },
  { pattern: '^37B', category: '機構部品', priority: 20 },
  { pattern: '^95B15', category: '燃焼器系', priority: 30 },
  { pattern: '^95B21', category: 'タービン系', priority: 40 },
  { pattern: '^95B(17|18|26)', category: '構造系', priority: 50 },
];

export const DEFAULT_OWNERS = ['佐藤 健', '田中 遼', '鈴木 彩', '山口 翔', '伊藤 亮'];
