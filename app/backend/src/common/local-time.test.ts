import { describe, expect, it } from 'vitest';
import { localClock, localIsoString, serverTimeZone, toLocalIso } from './local-time';

// サーバーの TZ に依存しないよう、期待値もローカル時刻で組み立てる
const d = new Date(2026, 8, 17, 8, 30, 5, 7); // ローカル 2026-09-17 08:30:05.007

describe('localClock', () => {
  it('returns the server-local date and HH:MM', () => {
    expect(localClock(d)).toEqual({ ymd: '2026-09-17', hm: '08:30' });
    expect(localClock(new Date(2026, 0, 1, 0, 0))).toEqual({ ymd: '2026-01-01', hm: '00:00' });
  });
});

describe('localIsoString', () => {
  it('shows the server-local wall clock with its offset', () => {
    expect(localIsoString(d)).toMatch(/^2026-09-17T08:30:05\.007[+-]\d{2}:\d{2}$/);
  });

  it('round-trips to the same instant', () => {
    expect(new Date(localIsoString(d)).getTime()).toBe(d.getTime());
  });
});

describe('toLocalIso', () => {
  it('converts legacy UTC values to server-local time', () => {
    expect(toLocalIso(d.toISOString())).toBe(localIsoString(d));
  });

  it('keeps values already in server-local time', () => {
    expect(toLocalIso(localIsoString(d))).toBe(localIsoString(d));
  });

  it('passes through offset-less or unparsable values, and nulls empties', () => {
    expect(toLocalIso('2026-09-17T08:30:00')).toBe('2026-09-17T08:30:00');
    expect(toLocalIso(null)).toBeNull();
    expect(toLocalIso('  ')).toBeNull();
  });
});

describe('serverTimeZone', () => {
  it('returns a non-empty name', () => {
    expect(serverTimeZone()).toBeTruthy();
  });
});
