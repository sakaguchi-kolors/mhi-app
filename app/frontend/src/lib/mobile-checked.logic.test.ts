import { describe, expect, it } from 'vitest';
import {
  CHECKED_RESET_HOUR,
  describeCheckedUntil,
  nextWorkdayMorning,
  parseChecked,
  pruneChecked,
  setChecked,
} from './mobile-checked.logic';

// 2026-08-27 は木曜、08-28 は金曜、08-29 は土曜
const thu = new Date(2026, 7, 27, 14, 0, 0);
const fri = new Date(2026, 7, 28, 14, 0, 0);

describe('mobile-checked.logic', () => {
  it('expires on the next morning of a weekday', () => {
    const d = new Date(nextWorkdayMorning(thu));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(28);
    expect(d.getHours()).toBe(CHECKED_RESET_HOUR);
  });

  it('skips the weekend so Friday lasts until Monday morning', () => {
    const d = new Date(nextWorkdayMorning(fri));
    expect(d.getDate()).toBe(31);
    expect(d.getDay()).toBe(1);
  });

  it('keeps the expiry ahead of a late-night check', () => {
    const lateNight = new Date(2026, 7, 27, 23, 30, 0);
    expect(nextWorkdayMorning(lateNight)).toBeGreaterThan(lateNight.getTime());
  });

  it('drops expired and malformed entries', () => {
    const map = { a: thu.getTime() + 1000, b: thu.getTime() - 1000, c: 'x' as unknown as number };
    expect(pruneChecked(map, thu)).toEqual({ a: thu.getTime() + 1000 });
  });

  it('sets and clears a single part', () => {
    const on = setChecked({}, 'OS-1', true, thu);
    expect(on['OS-1']).toBe(nextWorkdayMorning(thu));
    expect(setChecked(on, 'OS-1', false, thu)).toEqual({});
  });

  it('does not mutate the given map', () => {
    const before = { 'OS-1': thu.getTime() + 1000 };
    setChecked(before, 'OS-2', true, thu);
    expect(Object.keys(before)).toEqual(['OS-1']);
  });

  it('parses storage safely', () => {
    expect(parseChecked(null, thu)).toEqual({});
    expect(parseChecked('not json', thu)).toEqual({});
    expect(parseChecked('[1,2]', thu)).toEqual({});
    expect(parseChecked(JSON.stringify({ a: thu.getTime() + 5000 }), thu)).toEqual({ a: thu.getTime() + 5000 });
    expect(parseChecked(JSON.stringify({ a: thu.getTime() - 5000 }), thu)).toEqual({});
  });

  it('describes the expiry in plain Japanese', () => {
    expect(describeCheckedUntil(nextWorkdayMorning(thu), thu)).toBe(`明日${CHECKED_RESET_HOUR}時まで非表示`);
    expect(describeCheckedUntil(nextWorkdayMorning(fri), fri)).toBe(`8/31 ${CHECKED_RESET_HOUR}時まで非表示`);
  });
});
