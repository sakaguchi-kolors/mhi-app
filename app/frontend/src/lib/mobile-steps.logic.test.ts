import { describe, expect, it } from 'vitest';
import { countLeadingDone, hiddenLeadingDone } from './mobile-steps.logic';
import type { CellStatus } from '../types';

const steps = (...s: CellStatus[]) => s.map((status) => ({ status }));

describe('mobile-steps.logic', () => {
  it('counts only the leading run of completed steps', () => {
    expect(countLeadingDone(steps('done', 'done', 'current', 'wait'))).toBe(2);
    expect(countLeadingDone(steps('current', 'wait'))).toBe(0);
    expect(countLeadingDone(steps('done', 'done'))).toBe(2);
    expect(countLeadingDone([])).toBe(0);
  });

  it('keeps short histories visible', () => {
    expect(hiddenLeadingDone(steps('done', 'current', 'wait'))).toBe(0);
    expect(hiddenLeadingDone(steps('done', 'done', 'current'))).toBe(0);
  });

  it('collapses a long completed history so the current step is on screen', () => {
    expect(hiddenLeadingDone(steps('done', 'done', 'done', 'current', 'wait'))).toBe(3);
  });

  it('leaves the last step visible when everything is done', () => {
    expect(hiddenLeadingDone(steps('done', 'done', 'done', 'done'))).toBe(3);
  });
});
