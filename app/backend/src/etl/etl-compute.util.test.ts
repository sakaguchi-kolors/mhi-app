import { describe, expect, it } from 'vitest';
import { aggregateColorCounts } from './etl-compute.util';

describe('aggregateColorCounts', () => {
  it('counts colors', () => {
    expect(aggregateColorCounts(['green', 'yellow', 'red', 'green', null])).toEqual({
      green: 3,
      yellow: 1,
      red: 1,
    });
  });
});
