import { useMemo, useState } from 'react';
import type { Row } from './shared';
import { num, str } from './shared';

type Props = {
  rows: Row[];
  onSave: (row: Row, isNew: boolean) => Promise<void>;
  onDelete: (id: unknown) => Promise<void>;
};

function safeRe(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

export function CategoryEditor({ rows, onSave, onDelete }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Row>>({});
  const [newRow, setNewRow] = useState<Row>({ pattern: '', category: '', priority: 100, active: true });
  const [testPartNo, setTestPartNo] = useState('');

  const viewRows = useMemo(() => {
    const mapped = rows.map((r) => {
      const id = str(r.id);
      return drafts[id] ? { ...r, ...drafts[id] } : r;
    });
    return [...mapped].sort((a, b) => num(a.priority) - num(b.priority));
  }, [rows, drafts]);

  const matched = useMemo(() => {
    const q = testPartNo.trim();
    if (!q) return null;
    for (const r of viewRows) {
      if (!(r.active === true || r.active === 'true')) continue;
      const re = safeRe(str(r.pattern));
      if (re && re.test(q)) return { category: str(r.category), pattern: str(r.pattern), priority: num(r.priority) };
    }
    return { category: 'その他', pattern: '', priority: -1 };
  }, [viewRows, testPartNo]);

  return (
    <div className="master-forms">
      <div className="master-card">
        <h4>完成品分類</h4>
        <p className="mnote">
          部品番号に正規表現を当て、優先度が小さい順に最初の一致を分類にします。どれにも当たらなければ「その他」です。
        </p>
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
                <th />
              </tr>
            </thead>
            <tbody>
              {viewRows.map((row) => {
                const id = str(row.id);
                const reOk = !str(row.pattern) || !!safeRe(str(row.pattern));
                return (
                  <tr key={id}>
                    <td>
                      <input
                        type="text"
                        value={str(row.pattern)}
                        className={reOk ? '' : 'input-error'}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [id]: { ...(p[id] ?? {}), pattern: e.target.value } }))
                        }
                      />
                      {!reOk && <div className="param-warn">正規表現が不正です</div>}
                    </td>
                    <td>
                      <input
                        type="text"
                        value={str(row.category)}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [id]: { ...(p[id] ?? {}), category: e.target.value } }))
                        }
                      />
                    </td>
                    <td style={{ width: 90 }}>
                      <input
                        type="number"
                        value={str(row.priority)}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [id]: { ...(p[id] ?? {}), priority: e.target.value } }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.active === true || row.active === 'true'}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [id]: { ...(p[id] ?? {}), active: e.target.checked } }))
                        }
                      />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="mbtn save"
                        onClick={async () => {
                          await onSave({ ...row, ...(drafts[id] ?? {}) }, false);
                          setDrafts((p) => {
                            const n = { ...p };
                            delete n[id];
                            return n;
                          });
                        }}
                      >
                        保存
                      </button>{' '}
                      <button type="button" className="mbtn del" onClick={() => onDelete(row.id)}>
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
      </div>
    </div>
  );
}
