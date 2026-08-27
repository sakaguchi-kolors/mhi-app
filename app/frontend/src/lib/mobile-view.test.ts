import { describe, expect, it } from 'vitest';
import { shouldAutoRedirectToMobile } from './mobile-view';

describe('mobile-view', () => {
  it('sends narrow devices to the mobile inbox from the entry paths', () => {
    expect(shouldAutoRedirectToMobile('/', 'auto', true)).toBe(true);
    expect(shouldAutoRedirectToMobile('/parts', 'auto', true)).toBe(true);
  });

  it('leaves wide devices on the PC screens', () => {
    expect(shouldAutoRedirectToMobile('/parts', 'auto', false)).toBe(false);
  });

  it('never hijacks other PC screens', () => {
    expect(shouldAutoRedirectToMobile('/masters/param', 'mobile', true)).toBe(false);
    expect(shouldAutoRedirectToMobile('/parts/OS-1', 'mobile', true)).toBe(false);
    expect(shouldAutoRedirectToMobile('/heatmap', 'auto', true)).toBe(false);
  });

  it('respects an explicit choice', () => {
    expect(shouldAutoRedirectToMobile('/parts', 'pc', true)).toBe(false);
    expect(shouldAutoRedirectToMobile('/parts', 'mobile', false)).toBe(true);
  });
});
