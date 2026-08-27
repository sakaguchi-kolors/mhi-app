// 「今日は確認した」の保持ロジック（第1弾は端末内のみ／サーバー未保存）。
// 第2弾でサーバー保存に差し替えるため、期限計算と保存形式はここに閉じておく。

/** OS_ID → 期限（epoch ms）。期限を過ぎたら受信箱に戻す */
export type CheckedMap = Record<string, number>;

export const CHECKED_STORAGE_KEY = 'mop_m_checked';

/** 「朝」の基準時刻。これを過ぎると受信箱に戻る */
export const CHECKED_RESET_HOUR = 6;

/**
 * 翌稼働日の朝（既定 6:00）。土日は稼働日として数えない。
 * 祝日カレンダーはサーバー側マスタにしか無いため、第1弾では土日のみ考慮する。
 */
export function nextWorkdayMorning(now: Date): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), CHECKED_RESET_HOUR, 0, 0, 0);
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return d.getTime();
}

/** 期限切れを落とす。読み書きの両方で通し、古い記録が溜まらないようにする */
export function pruneChecked(map: CheckedMap, now: Date): CheckedMap {
  const t = now.getTime();
  const next: CheckedMap = {};
  for (const [id, expires] of Object.entries(map)) {
    if (typeof expires === 'number' && expires > t) next[id] = expires;
  }
  return next;
}

export function setChecked(map: CheckedMap, osId: string, on: boolean, now: Date): CheckedMap {
  const next = pruneChecked(map, now);
  if (on) next[osId] = nextWorkdayMorning(now);
  else delete next[osId];
  return next;
}

/** localStorage から復元。壊れた値は無視して空で始める */
export function parseChecked(raw: string | null, now: Date): CheckedMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return pruneChecked(parsed as CheckedMap, now);
  } catch {
    return {};
  }
}

/** 期限の表示文言（例：「明日6時まで非表示」） */
export function describeCheckedUntil(expires: number, now: Date): string {
  const d = new Date(expires);
  const sameMonthDay = d.getMonth() === now.getMonth() && d.getDate() === now.getDate() + 1;
  const time = `${d.getHours()}時`;
  if (sameMonthDay) return `明日${time}まで非表示`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}まで非表示`;
}
