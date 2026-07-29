import { clean } from './csv';

function isValidYmd(y: number, m: number, d: number): boolean {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function parseDateTime(s: string): Date | null {
  const v = clean(s);
  if (!v) return null;
  const datePart = v.split(/\s+/)[0];
  const m = datePart.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!isValidYmd(y, mo, d)) return null;
  return new Date(y, mo - 1, d);
}

export function parsePbsMonthEnd(s: string): Date | null {
  const v = clean(s);
  const m = v.match(/^(\d{4})[-/](\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return new Date(y, mo, 0);
}

export function parseSeq(label: string): { main: number; sub: number } {
  const v = clean(label);
  const [a, b] = v.split('-');
  return { main: parseInt(a, 10) || 0, sub: b ? parseInt(b, 10) || 0 : 0 };
}

/** MM/DD を asOf 近傍の日付に補完（DB保存用。年跨ぎは近い方を採用） */
export function mmddToDate(mmdd: string | undefined, asOf: Date): Date | null {
  if (!mmdd) return null;
  const [m, d] = mmdd.split('/').map(Number);
  if (!m || !d) return null;
  const y = asOf.getFullYear();
  const cand = new Date(y, m - 1, d);
  const prev = new Date(y - 1, m - 1, d);
  const next = new Date(y + 1, m - 1, d);
  const arr = [prev, cand, next].filter((dt) => dt.getMonth() === m - 1 && dt.getDate() === d);
  if (arr.length === 0) return null;
  arr.sort((a, b) => Math.abs(a.getTime() - asOf.getTime()) - Math.abs(b.getTime() - asOf.getTime()));
  return arr[0];
}
