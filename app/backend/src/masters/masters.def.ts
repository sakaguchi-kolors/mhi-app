// マスタの定義・既定シード（CRUD/UI と 算出 の両方が参照する単一の源のうち「定義」部分）
// 算出用の読込は masters.util.ts（loadMasters）。
import type { ColDef, MasterDef } from '../shared/types';

export type { ColDef, MasterDef };
export type ColType = ColDef['type'];

export const MASTERS: MasterDef[] = [
  {
    name: 'param',
    table: 'm_param',
    label: 'パラメータ設定',
    group: 'edit',
    pk: 'key',
    autoId: false,
    note: '緊急度の色・所要日数など。保存すると一覧に自動反映されます。',
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
    pk: 'shop_job',
    autoId: false,
    note: 'SHOP_JOBマスタを基本とし、FLEXSCHEにのみ存在する工程は取込時に自動補完されます。取込時に利用中でない工程は過去マスタへ自動退避されます。工程マイルストン(◎)・外注(外)をチェックで指定します。保存するとタイムラインに自動反映されます。',
    columns: [
      { key: 'shop', label: 'SHOP', type: 'text', readonly: true },
      { key: 'job', label: 'JOB', type: 'text', readonly: true },
      { key: 'name', label: '作業名称', type: 'text', readonly: true },
      { key: 'source', label: '取得元', type: 'text', readonly: true },
      { key: 'in_use', label: '利用中', type: 'bool', readonly: true },
      { key: 'last_used_at', label: '最終利用日', type: 'date', readonly: true },
      { key: 'is_milestone', label: '工程マイルストン', type: 'bool' },
      { key: 'gaic', label: '外注', type: 'bool' },
      { key: 'archived', label: '過去マスタ', type: 'bool' },
    ],
  },
  {
    name: 'kishu_due_priority',
    table: 'm_kishu_due_priority',
    label: '機種別納期優先順位',
    group: 'edit',
    pk: 'kishu',
    autoId: false,
    note: '標準の優先順位を設定し、必要な機種のみ個別設定します。標準に合わせる機種は標準変更に自動で追随します。',
    columns: [
      { key: 'kishu', label: '機種', type: 'text', readonly: true },
      { key: 'mode', label: '設定', type: 'select', options: ['default', 'custom'] },
      { key: 'priority_1', label: '第1優先', type: 'select', options: ['flexsche', 'octopus', 'pbs'] },
      { key: 'priority_2', label: '第2優先', type: 'select', options: ['flexsche', 'octopus', 'pbs'] },
      { key: 'priority_3', label: '第3優先', type: 'select', options: ['flexsche', 'octopus', 'pbs'] },
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
    note: '注文番号の前方一致で外注先名を表示。保存後すぐタイムラインに反映されます。',
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
  { key: 'KISHU_DUE_PRIORITY_1', value: 'pbs', description: '機種別納期優先順位（標準・第1優先）' },
  { key: 'KISHU_DUE_PRIORITY_2', value: 'flexsche', description: '機種別納期優先順位（標準・第2優先）' },
  { key: 'KISHU_DUE_PRIORITY_3', value: 'octopus', description: '機種別納期優先順位（標準・第3優先）' },
  { key: 'HEAT_WEEKS', value: '12', description: '工程ヒートマップの既定表示週数' },
  { key: 'HEAT_MIN_COUNT', value: '3', description: 'ヒートマップ：この件数未満のセルは混雑判定せず平常とする' },
  { key: 'HEAT_LEVEL_WARN', value: '1.2', description: 'ヒートマップ：平常時の何倍で「やや混雑（黄）」' },
  { key: 'HEAT_LEVEL_ALERT', value: '1.5', description: 'ヒートマップ：平常時の何倍で「混雑（赤）」' },
  { key: 'HEAT_LEVEL_CRIT', value: '2', description: 'ヒートマップ：平常時の何倍で「過密（濃赤）」' },
  { key: 'HEAT_ABS_WARN', value: '0', description: 'ヒートマップ：件数そのものが何件で黄（0=使わない）' },
  { key: 'HEAT_ABS_ALERT', value: '0', description: 'ヒートマップ：件数そのものが何件で赤（0=使わない）' },
  { key: 'HEAT_ABS_CRIT', value: '0', description: 'ヒートマップ：件数そのものが何件で濃赤（0=使わない）' },
  { key: 'LT_MODE', value: 'fixed', description: 'Shop別LTの算出方式（fixed=マスタ固定 / actual=実績集計）' },
  { key: 'LT_ACTUAL_PERCENTILE', value: 'p50', description: '実績LTのどの分位点を採用するか（p50 / p75 / p90）' },
  { key: 'LT_MIN_SAMPLES', value: '10', description: '実績LTを採用するのに必要な最小サンプル数' },
  { key: 'LT_ACTUAL_MAX_DAYS', value: '365', description: '実績LT集計：これを超える工程間隔は異常値として除外' },
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
