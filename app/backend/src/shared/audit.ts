/** 監査ログの表示・diff・CSV で共有する定数とユーティリティ */

export const AUDIT_SKIP_KEYS = new Set(['created_at', 'created_by', 'updated_at', 'updated_by']);

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'master.insert': '新規',
  'master.update': '更新',
  'master.delete': '削除',
  'master.import': '取込',
};

export const AUDIT_CSV_MAX_ROWS = 10000;

/** diff / CSV 比較用（空は空文字） */
export function auditCompareVal(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'はい' : 'いいえ';
  return String(v);
}

/** UI 表示用（空は em dash） */
export function auditDisplayVal(v: unknown): string {
  const s = auditCompareVal(v);
  return s === '' ? '—' : s;
}

export function auditDiffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((k) => !AUDIT_SKIP_KEYS.has(k) && auditCompareVal(before?.[k]) !== auditCompareVal(after?.[k]));
}

export function auditActionLabel(action: string | null | undefined): string {
  if (!action) return '';
  return AUDIT_ACTION_LABEL[action] ?? action;
}

export function auditCsvOverLimitMessage(total: number): string {
  return `該当件数が${total.toLocaleString('ja-JP')}件あります。CSV出力は最大${AUDIT_CSV_MAX_ROWS.toLocaleString('ja-JP')}件です。期間やマスタで絞り込んでください。`;
}

export function auditCsvEscape(v: string): string {
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function auditFmtAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace('T', ' ').slice(0, 19);
}
