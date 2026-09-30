// サーバー（OS）のタイムゾーンでの日時表現。画面はこの値をそのまま表示する。

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** サーバーのタイムゾーン名（例: Asia/Tokyo） */
export function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
}

/** サーバーのローカル日付(YYYY-MM-DD)と時刻(HH:MM) */
export function localClock(now = new Date()): { ymd: string; hm: string } {
  return {
    ymd: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    hm: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

/** サーバーのローカル時刻の ISO（オフセット付き）例: `2026-09-17T08:30:00.000+09:00` */
export function localIsoString(now = new Date()): string {
  const { ymd, hm } = localClock(now);
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${ymd}T${hm}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** 保存済みの日時（旧データの UTC `Z` を含む）をサーバーのローカル時刻 ISO に揃える。解釈できない値はそのまま。 */
export function toLocalIso(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const s = stored.trim();
  if (!s) return null;
  if (!/Z$|[+-]\d{2}:\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? s : localIsoString(dt);
}
