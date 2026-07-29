/** ローカルタイムゾーンの YYYY-MM-DD */
export function localYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`);
}

export function mmdd(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function ymd(d: Date | null | undefined): string {
  if (!d) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function daysSince(from: Date | null | undefined, asOf: Date): number | null {
  if (!from) return null;
  const a = Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const b = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.max(0, Math.round((a - b) / 86400000));
}
