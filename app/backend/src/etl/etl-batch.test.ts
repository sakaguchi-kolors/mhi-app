import { describe, expect, it, vi } from 'vitest';
import { batchInsert } from './etl-batch';

describe('batchInsert', () => {
  it('chunks large inserts', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = { $executeRawUnsafe: execute };
    const rows = Array.from({ length: 20000 }, (_, i) => [i, `v${i}`]);
    await batchInsert(tx as never, 't_test', ['a', 'b'], rows);
    expect(execute).toHaveBeenCalled();
    expect(execute.mock.calls.length).toBeGreaterThan(1);
  });

  it('skips empty rows', async () => {
    const execute = vi.fn();
    const tx = { $executeRawUnsafe: execute };
    await batchInsert(tx as never, 't_test', ['a'], []);
    expect(execute).not.toHaveBeenCalled();
  });
});
