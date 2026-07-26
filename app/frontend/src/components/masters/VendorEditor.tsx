import { useMemo, useState } from 'react';
import type { Row } from './shared';
import { str } from './shared';

type Props = {
  rows: Row[];
  onSave: (row: Row, isNew: boolean) => Promise<void>;
  onDelete: (prefix: unknown) => Promise<void>;
};

export function VendorEditor({ rows, onSave, onDelete }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Row>>({});
  const [newRow, setNewRow] = useState<Row>({ order_prefix: '', vendor_name: '', active: true });
  const [testOrder, setTestOrder] = useState('');

  const viewRows = rows.map((r) => {
    const pk = str(r.order_prefix);
    return drafts[pk] ? { ...r, ...drafts[pk] } : r;
  });

  const active = useMemo(() => {
    return viewRows
      .filter((r) => r.active === true || r.active === 'true')
      .map((r) => ({ prefix: str(r.order_prefix), name: str(r.vendor_name) }))
      .sort((a, b) => b.prefix.length - a.prefix.length);
  }, [viewRows]);

  const matched = useMemo(() => {
    const q = testOrder.trim();
    if (!q) return null;
    return active.find((v) => q.startsWith(v.prefix)) ?? null;
  }, [active, testOrder]);

  return (
    <div className="master-forms">
      <div className="master-card">
        <h4>外注先名の表示</h4>
        <p className="mnote">
          注文番号の先頭（プレフィックス）が一致すると、タイムラインに外注先名を表示します。長いプレフィックスが優先されます。
        </p>
        <div className="test-box">
          <label>注文番号で確認</label>
          <div className="param-inline">
            <input
              type="text"
              placeholder="例: ABC-12345"
              value={testOrder}
              onChange={(e) => setTestOrder(e.target.value)}
            />
            <span className={`test-result ${matched ? 'ok' : testOrder ? 'ng' : ''}`}>
              {testOrder.trim() ? (matched ? `→ ${matched.name}` : '→ 該当なし') : '入力すると結果が出ます'}
            </span>
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="mtable">
            <thead>
              <tr>
                <th>注文番号プレフィックス</th>
                <th>外注先名</th>
                <th>有効</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {viewRows.map((row) => {
                const pk = str(row.order_prefix);
                return (
                  <tr key={pk}>
                    <td>
                      <code>{pk}</code>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={str(row.vendor_name)}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [pk]: { ...(p[pk] ?? {}), vendor_name: e.target.value } }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.active === true || row.active === 'true'}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [pk]: { ...(p[pk] ?? {}), active: e.target.checked } }))
                        }
                      />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="mbtn save"
                        onClick={async () => {
                          const merged = { ...row, ...(drafts[pk] ?? {}) };
                          // return_lt は算出未使用のため UI から外し、既存値は維持
                          await onSave(merged, false);
                          setDrafts((p) => {
                            const n = { ...p };
                            delete n[pk];
                            return n;
                          });
                        }}
                      >
                        保存
                      </button>{' '}
                      <button type="button" className="mbtn del" onClick={() => onDelete(row.order_prefix)}>
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: '#f7faff' }}>
                <td>
                  <input
                    type="text"
                    placeholder="プレフィックス"
                    value={str(newRow.order_prefix)}
                    onChange={(e) => setNewRow((p) => ({ ...p, order_prefix: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="外注先名"
                    value={str(newRow.vendor_name)}
                    onChange={(e) => setNewRow((p) => ({ ...p, vendor_name: e.target.value }))}
                  />
                </td>
                <td>
                  <input type="checkbox" checked readOnly />
                </td>
                <td>
                  <button
                    type="button"
                    className="mbtn add"
                    onClick={async () => {
                      if (!str(newRow.order_prefix).trim() || !str(newRow.vendor_name).trim()) return;
                      await onSave(
                        {
                          order_prefix: str(newRow.order_prefix).trim(),
                          vendor_name: str(newRow.vendor_name).trim(),
                          active: true,
                        },
                        true,
                      );
                      setNewRow({ order_prefix: '', vendor_name: '', active: true });
                    }}
                  >
                    ＋追加
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
