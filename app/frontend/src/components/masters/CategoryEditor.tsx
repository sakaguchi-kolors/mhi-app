import { useMemo, useState } from 'react';
import type { Part } from '../../types';
import type { Row } from './shared';
import { classifyPart, num, str, isActive } from './shared';
import { MasterEditorShell } from './MasterEditorShell';
import { MasterRowActions } from './MasterRowActions';
import { UpdatedMeta } from './RowHistory';
import { useMasterDrafts } from './useMasterDrafts';

type Props = {
  rows: Row[];
  parts: Part[];
  onSave: (row: Row, isNew: boolean) => Promise<boolean>;
  onDelete: (id: unknown) => Promise<boolean>;
};

function safeRe(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

export function CategoryEditor({ rows, parts, onSave, onDelete }: Props) {
  const [newRow, setNewRow] = useState<Row>({ pattern: '', category: '', priority: 100, active: true });
  const [testPartNo, setTestPartNo] = useState('');
  const { viewRows, patchDraft, clearDraft } = useMasterDrafts(rows, (r) => str(r.id));

  const sortedRows = useMemo(
    () => [...viewRows].sort((a, b) => num(a.priority) - num(b.priority)),
    [viewRows],
  );

  const matched = useMemo(() => {
    const q = testPartNo.trim();
    if (!q) return null;
    for (const r of viewRows) {
      if (!isActive(r)) continue;
      const re = safeRe(str(r.pattern));
      if (re && re.test(q)) return { category: str(r.category), pattern: str(r.pattern), priority: num(r.priority) };
    }
    return { category: 'その他', pattern: '', priority: -1 };
  }, [viewRows, testPartNo]);

  const previewRows = useMemo(() => {
    const pattern = str(newRow.pattern).trim();
    const category = str(newRow.category).trim();
    if (!pattern || !category || !safeRe(pattern)) return viewRows;
    return [...viewRows, { ...newRow, pattern, category, priority: num(newRow.priority, 100), active: true }];
  }, [viewRows, newRow]);

  const categoryImpact = useMemo(() => {
    const changed: { partNo: string; from: string; to: string }[] = [];
    for (const p of parts) {
      const to = classifyPart(p.partNo, previewRows);
      if (p.category !== to) changed.push({ partNo: p.partNo, from: p.category, to });
    }
    return changed;
  }, [parts, previewRows]);

  return (
    <MasterEditorShell
      title="完成品分類"
      note="部品番号に正規表現を当て、優先度が小さい順に最初の一致を分類にします。どれにも当たらなければ「その他」です。"
    >
        <p className="param-effect">変更すると：部品一覧の「完成品分類」列が変わります。</p>
        <div className="param-preview">
          <div className="param-preview-title">分類が変わる部品（編集中・追加行を含む試算）</div>
          <div className="param-preview-row">
            <span>現状の部品データ</span>
            <span className="pill yellow">{categoryImpact.length} 件が変わる</span>
            {categoryImpact.length === 0 && <span className="param-delta ok">変化なし</span>}
          </div>
          {categoryImpact.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="mtable">
                <thead>
                  <tr>
                    <th>部品番号</th>
                    <th>変更前</th>
                    <th>変更後</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryImpact.slice(0, 8).map((c) => (
                    <tr key={c.partNo}>
                      <td>{c.partNo}</td>
                      <td>{c.from}</td>
                      <td>{c.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {categoryImpact.length > 8 && (
                <p className="mnote" style={{ margin: '8px 0 0' }}>他 {categoryImpact.length - 8} 件…</p>
              )}
            </div>
          )}
        </div>
        <div className="test-box">
          <label>部品番号で確認</label>
          <div className="param-inline">
            <input
              type="text"
              placeholder="例: V12345"
              value={testPartNo}
              onChange={(e) => setTestPartNo(e.target.value)}
            />
            <span className={`test-result ${matched && matched.priority >= 0 ? 'ok' : testPartNo ? 'ng' : ''}`}>
              {testPartNo.trim()
                ? matched
                  ? matched.priority >= 0
                    ? `→ ${matched.category}（priority ${matched.priority}）`
                    : '→ その他'
                  : ''
                : '入力すると結果が出ます'}
            </span>
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="mtable">
            <thead>
              <tr>
                <th>パターン（正規表現）</th>
                <th>分類</th>
                <th>優先度</th>
                <th>有効</th>
                <th>最終更新</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const id = str(row.id);
                const reOk = !str(row.pattern) || !!safeRe(str(row.pattern));
                return (
                  <tr key={id}>
                    <td>
                      <input
                        type="text"
                        value={str(row.pattern)}
                        className={reOk ? '' : 'input-error'}
                        onChange={(e) => patchDraft(id, { pattern: e.target.value })}
                      />
                      {!reOk && <div className="param-warn">正規表現が不正です</div>}
                    </td>
                    <td>
                      <input
                        type="text"
                        value={str(row.category)}
                        onChange={(e) => patchDraft(id, { category: e.target.value })}
                      />
                    </td>
                    <td style={{ width: 90 }}>
                      <input
                        type="number"
                        value={str(row.priority)}
                        onChange={(e) => patchDraft(id, { priority: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.active === true || row.active === 'true'}
                        onChange={(e) => patchDraft(id, { active: e.target.checked })}
                      />
                    </td>
                    <td>
                      <UpdatedMeta row={row} />
                    </td>
                    <MasterRowActions
                      onSave={async () => {
                        await onSave({ id: row.id, ...row }, false);
                        clearDraft(id);
                      }}
                      onDelete={() => onDelete(row.id)}
                      deleteDisabled={row.id == null || row.id === ''}
                    />
                  </tr>
                );
              })}
              <tr style={{ background: '#f7faff' }}>
                <td>
                  <input
                    type="text"
                    placeholder="^V"
                    value={str(newRow.pattern)}
                    onChange={(e) => setNewRow((p) => ({ ...p, pattern: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="分類名"
                    value={str(newRow.category)}
                    onChange={(e) => setNewRow((p) => ({ ...p, category: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={str(newRow.priority)}
                    onChange={(e) => setNewRow((p) => ({ ...p, priority: e.target.value }))}
                  />
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
                      if (!str(newRow.pattern).trim() || !str(newRow.category).trim()) return;
                      if (!safeRe(str(newRow.pattern))) return;
                      await onSave(
                        {
                          pattern: str(newRow.pattern).trim(),
                          category: str(newRow.category).trim(),
                          priority: num(newRow.priority, 100),
                          active: true,
                        },
                        true,
                      );
                      setNewRow({ pattern: '', category: '', priority: 100, active: true });
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
