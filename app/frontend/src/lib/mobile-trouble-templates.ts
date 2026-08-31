// スマホの困りごとテンプレ（第1弾は固定リスト。マスタ化は第2弾）。

export type TroubleTemplate = {
  id: string;
  label: string;
  /** true のとき、理由の追記がないと確定できない */
  requiresNote: boolean;
};

export const TROUBLE_TEMPLATES: TroubleTemplate[] = [
  { id: 'material', label: '材料未入荷', requiresNote: false },
  { id: 'prev', label: '前工程の遅れ', requiresNote: false },
  { id: 'vendor', label: '外注戻り遅れ', requiresNote: false },
  { id: 'drawing', label: '図面・仕様待ち', requiresNote: false },
  { id: 'tool', label: '治具・設備トラブル', requiresNote: false },
  { id: 'inspect', label: '検査待ち・不適合', requiresNote: false },
  { id: 'staff', label: '人員不足', requiresNote: false },
  { id: 'other', label: 'その他', requiresNote: true },
];

export function findTroubleTemplate(id: string): TroubleTemplate | undefined {
  return TROUBLE_TEMPLATES.find((t) => t.id === id);
}

/** テンプレを困りごとメモの先頭に足す。既存メモは残す */
export function composeTroubleMemo(prev: string | undefined, label: string, note?: string): string {
  const extra = note?.trim();
  const line = extra ? `${label}：${extra}` : label;
  const cur = (prev ?? '').trim();
  if (!cur) return line;
  if (cur.startsWith(line) || cur.split('\n')[0] === line) return cur;
  return `${line}\n${cur}`;
}

export function canConfirmTrouble(template: TroubleTemplate | undefined, note: string): boolean {
  if (!template) return false;
  if (!template.requiresNote) return true;
  return note.trim().length > 0;
}
