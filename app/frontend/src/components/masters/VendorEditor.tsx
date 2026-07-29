import { useMemo, useState } from 'react';
import type { Row } from './shared';
import { str, isActive } from './shared';
import { MasterEditorShell } from './MasterEditorShell';
import { MasterRowActions } from './MasterRowActions';
import { UpdatedMeta } from './RowHistory';
import { useMasterDrafts } from './useMasterDrafts';

type Props = {
  rows: Row[];
  onSave: (row: Row, isNew: boolean) => Promise<boolean>;
  onDelete: (prefix: unknown) => Promise<boolean>;
};

export function VendorEditor({ rows, onSave, onDelete }: Props) {
  const [newRow, setNewRow] = useState<Row>({ order_prefix: '', vendor_name: '', active: true });
  const [testOrder, setTestOrder] = useState('');
  const { viewRows, patchDraft, clearDraft } = useMasterDrafts(rows, (r) => str(r.order_prefix));

  const active = useMemo(() => {
    return viewRows
      .filter((r) => isActive(r))
      .map((r) => ({ prefix: str(r.order_prefix), name: str(r.vendor_name) }))
      .sort((a, b) => b.prefix.length - a.prefix.length);
  }, [viewRows]);

  const matched = useMemo(() => {
    const q = testOrder.trim();
    if (!q) return null;
    return active.find((v) => q.startsWith(v.prefix)) ?? null;
  }, [active, testOrder]);

  return (
    <MasterEditorShell
      title="外注先名の表示"
      note="注文番号の先頭（プレフィックス）が一致すると、タイムラインに外注先名を表示します。長いプレフィックスが優先されます。"
    >
      <p className="param-effect">変更すると：部品詳細タイムラインの外注先名（gvendor）表示が変わります。保存後すぐ反映されます。</p>
      <div className="test-box">
        <label>注文番号で確認</label>
        <div className="param-inline">
          <input type="text" placeholder="例: ABC-12345" value={testOrder} onChange={(e) => setTestOrder(e.target.value)} />
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
              <th>最終更新</th>
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
                      onChange={(e) => patchDraft(pk, { vendor_name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.active === true || row.active === 'true'}
                      onChange={(e) => patchDraft(pk, { active: e.target.checked })}
                    />
                  </td>
                  <td>
                    <UpdatedMeta row={row} />
                  </td>
                  <MasterRowActions
                    onSave={async () => {
                      await onSave({ ...row }, false);
                      clearDraft(pk);
                    }}
                    onDelete={() => onDelete(row.order_prefix)}
                  />
                </tr>
              );
            })}
            <tr style={{ background: '#f7faff' }}>
              <td>
                <input type="text" placeholder="プレフィックス" value={str(newRow.order_prefix)} onChange={(e) => setNewRow((p) => ({ ...p, order_prefix: e.target.value }))} />
              </td>
              <td>
                <input type="text" placeholder="外注先名" value={str(newRow.vendor_name)} onChange={(e) => setNewRow((p) => ({ ...p, vendor_name: e.target.value }))} />
              </td>
              <td>
                <input type="checkbox" checked readOnly />
              </td>
              <td />
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
    </MasterEditorShell>
  );
}
