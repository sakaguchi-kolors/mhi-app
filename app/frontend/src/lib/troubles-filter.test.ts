import { describe, expect, it } from 'vitest';
import { troubleUrgency, troubleUrgencyLabel } from '../hooks/useTroublesFilter';

describe('troubleUrgency', () => {
  it('classifies days into buckets', () => {
    expect(troubleUrgency(1)).toBe('fresh');
    expect(troubleUrgency(5)).toBe('watch');
    expect(troubleUrgency(7)).toBe('critical');
  });

  it('returns labels', () => {
    expect(troubleUrgencyLabel(0)).toBe('0〜2日');
    expect(troubleUrgencyLabel(4)).toBe('3〜6日');
    expect(troubleUrgencyLabel(10)).toBe('7日以上');
  });
});
