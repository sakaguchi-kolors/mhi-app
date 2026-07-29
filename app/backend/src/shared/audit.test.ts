import { describe, expect, it } from 'vitest';
import {
  auditActionLabel,
  auditCompareVal,
  auditDiffFields,
  auditDisplayVal,
  auditCsvOverLimitMessage,
} from './audit';

describe('audit shared', () => {
  it('diffFields skips audit metadata keys', () => {
    const fields = auditDiffFields(
      { key: 'a', updated_at: '1', created_by: 'x' },
      { key: 'b', updated_at: '2', created_by: 'y' },
    );
    expect(fields).toEqual(['key']);
  });

  it('compareVal treats boolean consistently', () => {
    expect(auditCompareVal(true)).toBe('はい');
    expect(auditDisplayVal(null)).toBe('—');
  });

  it('actionLabel maps master actions', () => {
    expect(auditActionLabel('master.update')).toBe('更新');
    expect(auditActionLabel('other')).toBe('other');
  });

  it('csvOverLimitMessage includes counts', () => {
    expect(auditCsvOverLimitMessage(20000)).toContain('20,000');
  });
});
