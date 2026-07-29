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
