import { useMemo, useState } from 'react';
import type { Part } from '../../types';
import type { Row } from './shared';
import { num, partUsesShop, str } from './shared';
import { UpdatedMeta } from './RowHistory';

type Props = {
  rows: Row[];
  parts: Part[];
  defaultLt: number;
  onSave: (row: Row, isNew: boolean) => Promise<void>;
  onDelete: (shop: unknown) => Promise<void>;
};

export function ShopLtEditor({ rows, parts, defaultLt, onSave, onDelete }: Props) {
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

  const previewRows = useMemo(() => {
    const shop = str(newRow.shop).trim();
    if (!shop) return viewRows;
    if (viewRows.some((r) => str(r.shop) === shop)) {
      return viewRows.map((r) =>
        str(r.shop) === shop ? { ...r, ...newRow, shop, lt_days: newRow.lt_days ?? r.lt_days } : r,
      );
    }
    return [...viewRows, { ...newRow, shop, active: newRow.active ?? true }];
  }, [viewRows, newRow]);

  const shopImpact = useMemo(() => {
    return previewRows
      .filter((r) => r.active === true || r.active === 'true')
      .map((r) => {
        const shop = str(r.shop);
        const lt = num(r.lt_days, defaultLt);
        const partCount = parts.filter((p) => partUsesShop(p, shop)).length;
        return { shop, lt, partCount };
      })
      .filter((x) => x.shop)
      .sort((a, b) => b.partCount - a.partCount);
  }, [previewRows, parts, defaultLt]);

  const newShopPreview = useMemo(() => {
    const shop = str(newRow.shop).trim();
    if (!shop) return null;
    const count = parts.filter((p) => partUsesShop(p, shop)).length;
    return { shop, lt: num(newRow.lt_days, defaultLt), partCount: count };
  }, [newRow, parts, defaultLt]);

  const affectedTotal = useMemo(() => {
    const shops = new Set(shopImpact.map((x) => x.shop));
    return parts.filter((p) => [...shops].some((shop) => partUsesShop(p, shop))).length;
  }, [parts, shopImpact]);

  return (
    <div className="master-forms">
      <div className="master-card">
        <h4>Shop別の標準LT</h4>
        <p className="mnote">
          未登録のShopはパラメータの既定LT（現在 <b>{defaultLt}日</b>）を使います。ここに載せるのは例外だけです。
        </p>
        <p className="param-effect">変更すると：残Shop所要日数 → バッファ（余裕日数）→ 一覧の緊急度色が変わります。</p>
        <div className="param-preview">
          <div className="param-preview-title">例外Shopが効く部品（入力中の追加行を含む試算）</div>
          <div className="param-preview-row">
            <span>対象部品</span>
            <span className="pill yellow">{affectedTotal} 件</span>
            {shopImpact.length === 0 && <span className="param-delta ok">例外なし</span>}
          </div>
          {shopImpact.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="mtable">
                <thead>
                  <tr>
                    <th>Shop</th>
                    <th>LT（日）</th>
                    <th>未完了工程に含む部品</th>
                  </tr>
                </thead>
                <tbody>
                  {shopImpact.slice(0, 8).map((x) => (
                    <tr key={x.shop}>
                      <td><code>{x.shop}</code></td>
                      <td>{x.lt}</td>
                      <td>{x.partCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table className="mtable">
            <thead>
              <tr>
                <th>SHOP</th>
                <th>標準LT（日）</th>
                <th>有効</th>
                <th>最終更新</th>
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
                    <td>
                      <UpdatedMeta row={row} />
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
                <td />
                <td>
                  {newShopPreview && (
                    <p className="new-row-preview" style={{ margin: '0 0 6px', fontSize: 11 }}>
                      プレビュー: 未完了工程に {newShopPreview.partCount} 件（LT {newShopPreview.lt}日）
                    </p>
                  )}
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
