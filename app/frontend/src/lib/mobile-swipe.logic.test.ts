import { describe, expect, it } from 'vitest';
import { clampSwipeDx, decideSwipeAxis, swipeIntent } from './mobile-swipe.logic';

describe('mobile-swipe.logic', () => {
  it('stays undecided until the finger moves enough', () => {
    expect(decideSwipeAxis(4, 3)).toBe('undecided');
  });

  it('locks to x when horizontal movement wins', () => {
    expect(decideSwipeAxis(20, 4)).toBe('x');
    expect(decideSwipeAxis(-20, 8)).toBe('x');
  });

  it('locks to y so a list scroll is not stolen', () => {
    expect(decideSwipeAxis(4, 20)).toBe('y');
  });

  it('commits check on a long enough right swipe', () => {
    expect(swipeIntent(80)).toBe('check');
    expect(swipeIntent(120)).toBe('check');
  });

  it('commits trouble on a long enough left swipe', () => {
    expect(swipeIntent(-80)).toBe('trouble');
  });

  it('cancels when released before the threshold', () => {
    expect(swipeIntent(40)).toBe('none');
    expect(swipeIntent(-40)).toBe('none');
    expect(swipeIntent(0)).toBe('none');
  });

  it('clamps visual travel', () => {
    expect(clampSwipeDx(200)).toBe(120);
    expect(clampSwipeDx(-200)).toBe(-120);
    expect(clampSwipeDx(30)).toBe(30);
  });
});
