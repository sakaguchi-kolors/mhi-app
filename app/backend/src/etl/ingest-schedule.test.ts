import { describe, expect, it } from 'vitest';
import {
  addDaysYmd,
  defaultSchedule,
  nextRunAt,
  normalizeTime,
  normalizeTimes,
  parseScheduleInput,
  shouldTrigger,
  slotKey,
  tokyoClock,
  tokyoDateTime,
  toTokyoDateTime,
} from './ingest-schedule';

describe('normalizeTime', () => {
  it('accepts H:MM and HH:MM', () => {
    expect(normalizeTime('8:00')).toBe('08:00');
    expect(normalizeTime('08:00')).toBe('08:00');
    expect(normalizeTime('13:05')).toBe('13:05');
  });

  it('accepts HH:MM:SS by dropping seconds', () => {
    expect(normalizeTime('08:00:00')).toBe('08:00');
  });

  it('rejects invalid values', () => {
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('8')).toBeNull();
    expect(normalizeTime('25:00')).toBeNull();
    expect(normalizeTime('12:60')).toBeNull();
    expect(normalizeTime(8)).toBeNull();
  });
});

describe('normalizeTimes', () => {
  it('dedupes, sorts, and drops invalids', () => {
    expect(normalizeTimes(['13:00', '8:00', '08:00', 'bad'])).toEqual(['08:00', '13:00']);
  });

  it('returns empty for non-arrays', () => {
    expect(normalizeTimes('08:00')).toEqual([]);
  });
});

describe('shouldTrigger', () => {
  const now = { ymd: '2026-08-31', hm: '08:00' };

  it('triggers at a matching enabled time', () => {
    expect(shouldTrigger({ enabled: true, times: ['08:00', '13:00'], now, lastSlot: null })).toBe(true);
  });

  it('does not retrigger the same slot', () => {
    expect(
      shouldTrigger({
        enabled: true,
        times: ['08:00'],
        now,
        lastSlot: slotKey('2026-08-31', '08:00'),
      }),
    ).toBe(false);
  });

  it('can trigger the same clock time on the next day', () => {
    expect(
      shouldTrigger({
        enabled: true,
        times: ['08:00'],
        now: { ymd: '2026-09-01', hm: '08:00' },
        lastSlot: slotKey('2026-08-31', '08:00'),
      }),
    ).toBe(true);
  });

  it('skips when disabled or off-slot', () => {
    expect(shouldTrigger({ enabled: false, times: ['08:00'], now, lastSlot: null })).toBe(false);
    expect(shouldTrigger({ enabled: true, times: ['13:00'], now, lastSlot: null })).toBe(false);
  });
});

describe('nextRunAt', () => {
  it('picks a later time today', () => {
    expect(nextRunAt(['08:00', '13:00'], { ymd: '2026-08-31', hm: '09:00' })).toBe('2026-08-31T13:00');
  });

  it('rolls to tomorrow after the last slot', () => {
    expect(nextRunAt(['08:00', '13:00'], { ymd: '2026-08-31', hm: '13:00' })).toBe('2026-09-01T08:00');
  });

  it('returns null when empty', () => {
    expect(nextRunAt([], { ymd: '2026-08-31', hm: '08:00' })).toBeNull();
  });
});

describe('addDaysYmd / tokyoClock / parseScheduleInput', () => {
  it('adds calendar days over month boundaries', () => {
    expect(addDaysYmd('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('returns HH:MM in Asia/Tokyo', () => {
    const clock = tokyoClock(new Date('2026-08-31T00:00:00+09:00'));
    expect(clock).toEqual({ ymd: '2026-08-31', hm: '00:00' });
  });

  it('converts UTC ISO lastTriggeredAt to Tokyo wall clock', () => {
    expect(toTokyoDateTime('2026-08-31T03:30:08.123Z')).toBe('2026-08-31T12:30:08');
    expect(tokyoDateTime(new Date('2026-08-31T03:30:08Z'))).toBe('2026-08-31T12:30:08');
  });

  it('keeps an already-Tokyo wall clock string', () => {
    expect(toTokyoDateTime('2026-08-31T12:30:08')).toBe('2026-08-31T12:30:08');
    expect(toTokyoDateTime(null)).toBeNull();
  });

  it('parses a valid payload and keeps last-run fields unset', () => {
    const parsed = parseScheduleInput({ enabled: true, times: ['13:00', '8:00'] });
    expect(parsed.enabled).toBe(true);
    expect(parsed.times).toEqual(['08:00', '13:00']);
    expect(parsed.lastSlot).toBeNull();
  });

  it('rejects enabled with no times', () => {
    expect(() => parseScheduleInput({ enabled: true, times: [] })).toThrow(/1件以上/);
  });

  it('rejects garbage times', () => {
    expect(() => parseScheduleInput({ enabled: false, times: ['noon'] })).toThrow(/形式が不正/);
  });

  it('default schedule is disabled at 08:00 and 13:00', () => {
    expect(defaultSchedule()).toMatchObject({ enabled: false, times: ['08:00', '13:00'] });
  });
});
