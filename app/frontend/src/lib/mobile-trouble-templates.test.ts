import { describe, expect, it } from 'vitest';
import {
  canConfirmTrouble,
  composeTroubleMemo,
  findTroubleTemplate,
  TROUBLE_TEMPLATES,
} from './mobile-trouble-templates';

describe('mobile-trouble-templates', () => {
  it('has その他 as the only note-required item', () => {
    const other = TROUBLE_TEMPLATES.filter((t) => t.requiresNote);
    expect(other.map((t) => t.id)).toEqual(['other']);
  });

  it('writes the template as the memo when empty', () => {
    expect(composeTroubleMemo('', '材料未入荷')).toBe('材料未入荷');
    expect(composeTroubleMemo(undefined, 'その他', '治具が無い')).toBe('その他：治具が無い');
  });

  it('prepends without dropping the previous memo', () => {
    expect(composeTroubleMemo('昨日確認済み', '前工程の遅れ')).toBe('前工程の遅れ\n昨日確認済み');
  });

  it('does not duplicate the same first line', () => {
    expect(composeTroubleMemo('材料未入荷\nメモ', '材料未入荷')).toBe('材料未入荷\nメモ');
  });

  it('blocks その他 until a note is present', () => {
    const other = findTroubleTemplate('other');
    expect(canConfirmTrouble(other, '')).toBe(false);
    expect(canConfirmTrouble(other, '  ')).toBe(false);
    expect(canConfirmTrouble(other, '図面待ち')).toBe(true);
    expect(canConfirmTrouble(findTroubleTemplate('material'), '')).toBe(true);
    expect(canConfirmTrouble(undefined, 'x')).toBe(false);
  });
});
