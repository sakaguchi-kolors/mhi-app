import { useMemo, useState } from 'react';
import type { Row } from './shared';
import { num, str } from './shared';

type Props = {
  rows: Row[];
  defaultLt: number;
  onSave: (row: Row, isNew: boolean) => Promise<void>;
  onDelete: (shop: unknown) => Promise<void>;
};

export function ShopLtEditor({ rows, defaultLt, onSave, onDelete }: Props) {
  const [newRow, setNewRow] = useState<Row>({ shop: '', lt_days: defaultLt, active: true });
  const [drafts, setDrafts] = useState<Record<string, Row>>({});

  const viewRows = useMemo(
    () =>
      rows.map((r) => {
        const shop = str(r.shop);
        return drafts[shop] ? { ...r, ...drafts[shop] } : r;
      }),
    [rows, drafts],
  );

  return (
    <div className="master-forms">
      <div className="master-card">
        <h4>Shop別の標準LT</h4>
        <p className="mnote">
          未登録のShopはパラメータの既定LT（現在 <b>{defaultLt}日</b>）を使います。ここに載せるのは例外だけです。
        </p>
        <div className="table-wrap">
          <table className="mtable">
            <thead>
              <tr>
                <th>SHOP</th>
                <th>標準LT（日）</th>
                <th>有効</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {viewRows.map((row) => {
                const shop = str(row.shop);
                return (
                  <tr key={shop}>
                    <td>
                      <code>{shop}</code>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={str(row.lt_days)}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [shop]: { ...(p[shop] ?? {}), lt_days: e.target.value } }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.active === true || row.active === 'true'}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [shop]: { ...(p[shop] ?? {}), active: e.target.checked } }))
                        }
                      />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="mbtn save"
                        onClick={async () => {
                          await onSave({ ...row, ...(drafts[shop] ?? {}) }, false);
                          setDrafts((p) => {
                            const n = { ...p };
                            delete n[shop];
                            return n;
                          });
                        }}
                      >
                        保存
                      </button>{' '}
                      <button type="button" className="mbtn del" onClick={() => onDelete(row.shop)}>
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
                    placeholder="例: 7P3"
                    value={str(newRow.shop)}
                    onChange={(e) => setNewRow((p) => ({ ...p, shop: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={str(newRow.lt_days)}
                    onChange={(e) => setNewRow((p) => ({ ...p, lt_days: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={newRow.active === true || newRow.active === 'true'}
                    onChange={(e) => setNewRow((p) => ({ ...p, active: e.target.checked }))}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="mbtn add"
                    onClick={async () => {
                      if (!str(newRow.shop).trim()) return;
                      await onSave(
                        { shop: str(newRow.shop).trim(), lt_days: num(newRow.lt_days, defaultLt), active: true },
                        true,
                      );
                      setNewRow({ shop: '', lt_days: defaultLt, active: true });
                    }}
                  >
                    ＋例外を追加
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
