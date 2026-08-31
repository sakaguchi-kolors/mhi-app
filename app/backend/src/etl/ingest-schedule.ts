/** 自動取込スケジュールの純関数（時刻正規化・日本時間判定）。I/Oなし。 */

export const INGEST_TZ = 'Asia/Tokyo';
export const DEFAULT_INGEST_TIMES = ['08:00', '13:00'] as const;
export const AUTO_INGEST_USER = '自動取込';
export const MAX_INGEST_TIMES = 10;

export interface IngestScheduleStored {
  enabled: boolean;
  times: string[];
  lastTriggeredAt: string | null;
  lastSlot: string | null;
}

export interface ClockParts {
  ymd: string;
  hm: string;
}

const TIME_RE = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/;

export function defaultSchedule(): IngestScheduleStored {
  return {
    enabled: false,
    times: [...DEFAULT_INGEST_TIMES],
    lastTriggeredAt: null,
    lastSlot: null,
  };
}

export function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(TIME_RE);
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

export function normalizeTimes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const n = normalizeTime(item);
    if (n && !out.includes(n)) out.push(n);
  }
  return out.sort();
}

export function slotKey(ymd: string, hm: string): string {
  return `${ymd}T${hm}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function tokyoParts(now: Date, withSeconds: boolean) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: INGEST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' as const } : {}),
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    hm: `${hour.padStart(2, '0')}:${get('minute')}`,
    hms: withSeconds ? `${hour.padStart(2, '0')}:${get('minute')}:${get('second').padStart(2, '0')}` : '',
  };
}

/** 日本時間の日付(YYYY-MM-DD)と時刻(HH:MM) */
export function tokyoClock(now = new Date()): ClockParts {
  const p = tokyoParts(now, false);
  return { ymd: p.ymd, hm: p.hm };
}

/** 日本時間の壁時計 `YYYY-MM-DDTHH:MM:SS`（画面の最終自動取込用） */
export function tokyoDateTime(now = new Date()): string {
  const p = tokyoParts(now, true);
  return `${p.ymd}T${p.hms}`;
}

/** 保存済み ISO（UTC）を日本時間の壁時計に直す。既に壁時計ならそのまま。 */
export function toTokyoDateTime(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const s = stored.trim();
  if (!s) return null;
  if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) {
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) return s;
    return tokyoDateTime(dt);
  }
  return s;
}

export function shouldTrigger(opts: {
  enabled: boolean;
  times: string[];
  now: ClockParts;
  lastSlot: string | null;
}): boolean {
  if (!opts.enabled) return false;
  if (!opts.times.includes(opts.now.hm)) return false;
  return opts.lastSlot !== slotKey(opts.now.ymd, opts.now.hm);
}

export function nextRunAt(times: string[], now: ClockParts): string | null {
  if (!times.length) return null;
  const later = times.find((t) => t > now.hm);
  if (later) return slotKey(now.ymd, later);
  return slotKey(addDaysYmd(now.ymd, 1), times[0]);
}

export function parseScheduleInput(body: { enabled?: unknown; times?: unknown }): IngestScheduleStored {
  const enabled = Boolean(body.enabled);
  const times = normalizeTimes(body.times);
  if (times.length > MAX_INGEST_TIMES) {
    throw new Error(`取込時刻は${MAX_INGEST_TIMES}件までです`);
  }
  if (enabled && times.length === 0) {
    throw new Error('有効にする場合は取込時刻を1件以上指定してください');
  }
  if (Array.isArray(body.times) && body.times.length > 0 && times.length === 0) {
    throw new Error('取込時刻の形式が不正です（HH:MM）');
  }
  return {
    enabled,
    times,
    lastTriggeredAt: null,
    lastSlot: null,
  };
}
