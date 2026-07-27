import type { ColDef, MasterDef } from '../../types';
import type { Row } from './shared';
import { str } from './shared';
import { UpdatedMeta } from './RowHistory';

type Props = {
  def: MasterDef;
  rows: Row[];
  newRow: Row;
  setNewRow: (r: Row) => void;
  onChangeCell: (i: number, key: string, val: unknown) => void;
  onSave: (row: Row, isNew: boolean) => void;
  onDelete: (pkVal: unknown) => void;
};

export function MasterTable({ def, rows, newRow, setNewRow, onChangeCell, onSave, onDelete }: Props) {
  return (
    <div className="table-wrap">
      <table className="mtable">
        <thead>
          <tr>
            {def.columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
            <th>最終更新</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={str(row[def.pk]) + i}>
              {def.columns.map((c) => (
                <td key={c.key}>{cellInput(c, row[c.key], (v) => onChangeCell(i, c.key, v), false)}</td>
              ))}
              <td>
                <UpdatedMeta row={row} />
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button type="button" className="mbtn save" onClick={() => onSave(row, false)}>
                  保存
                </button>{' '}
                <button type="button" className="mbtn del" onClick={() => onDelete(row[def.pk])}>
                  削除
                </button>
              </td>
            </tr>
          ))}
          <tr style={{ background: '#f7faff' }}>
            {def.columns.map((c) => (
              <td key={c.key}>
                {cellInput(c, newRow[c.key], (v) => setNewRow({ ...newRow, [c.key]: v }), true)}
              </td>
            ))}
            <td />
            <td>
              <button type="button" className="mbtn add" onClick={() => onSave(newRow, true)}>
                ＋追加
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function cellInput(c: ColDef, val: unknown, onChange: (v: unknown) => void, isNew: boolean) {
  const disabled = c.readonly && !isNew;
  if (c.type === 'bool') {
    return (
      <input
        type="checkbox"
        checked={val === true || val === 'true'}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  if (c.type === 'number') {
    return (
      <input
        type="number"
        step="any"
        value={val == null ? '' : String(val)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (c.type === 'date') {
    return (
      <input
        type="date"
        value={val == null ? '' : String(val).slice(0, 10)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (c.type === 'select') {
    return (
      <select value={val == null ? '' : String(val)} onChange={(e) => onChange(e.target.value)}>
        {(c.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      value={val == null ? '' : String(val)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
