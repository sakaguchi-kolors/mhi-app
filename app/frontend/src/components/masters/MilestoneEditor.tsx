import { useMemo, useState } from 'react';
import type { Part } from '../../types';
import type { Row } from './shared';
import { MATCH_TYPE_LABEL, matchMilestone, str } from './shared';
import { UpdatedMeta } from './RowHistory';

type Props = {
  rows: Row[];
  parts: Part[];
  onSave: (row: Row, isNew: boolean) => Promise<void>;
  onDelete: (id: unknown) => Promise<void>;
};

const MATCH_TYPES = ['name_contains', 'shop_prefix', 'shop'] as const;

export function MilestoneEditor({ rows, parts, onSave, onDelete }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Row>>({});
  const [newRow, setNewRow] = useState<Row>({
    match_type: 'name_contains',
    pattern: '',
    label: '',
    active: true,
  });

  const viewRows = rows.map((r) => {
    const id = str(r.id);
    return drafts[id] ? { ...r, ...drafts[id] } : r;
  });

  const activeRules = viewRows.filter((r) => r.active === true || r.active === 'true');

  const previewRules = useMemo(() => {
    const rules = [...activeRules];
    const pattern = str(newRow.pattern).trim();
    if (pattern) {
      rules.push({ ...newRow, pattern, active: true });
    }
    return rules;
  }, [activeRules, newRow]);

  const samples = useMemo(() => {
    const seen = new Set<string>();
    const hits: { shop: string; name: string; partNo: string; rule: string }[] = [];
    for (const p of parts) {
      for (const cell of p.timeline) {
        const key = `${cell.shop}|${cell.name}`;
        if (seen.has(key)) continue;
        for (const rule of previewRules) {
          if (matchMilestone(str(rule.match_type), str(rule.pattern), cell.shop, cell.name)) {
            seen.add(key);
            hits.push({
              shop: cell.shop,
              name: cell.name,
              partNo: p.partNo,
              rule: `${MATCH_TYPE_LABEL[str(rule.match_type)] ?? str(rule.match_type)}「${str(rule.pattern)}」`,
            });
            break;
          }
        }
        if (hits.length >= 8) return hits;
      }
      if (hits.length >= 8) break;
    }
    return hits;
  }, [parts, previewRules]);

  const newRowPreview = useMemo(() => {
    const pattern = str(newRow.pattern).trim();
    if (!pattern) return [];
    const seen = new Set<string>();
    const hits: { shop: string; name: string; partNo: string }[] = [];
    for (const p of parts) {
      for (const cell of p.timeline) {
        const key = `${cell.shop}|${cell.name}`;
        if (seen.has(key)) continue;
        if (matchMilestone(str(newRow.match_type), pattern, cell.shop, cell.name)) {
          seen.add(key);
          hits.push({ shop: cell.shop, name: cell.name, partNo: p.partNo });
          if (hits.length >= 5) return hits;
        }
      }
    }
    return hits;
  }, [parts, newRow]);

  const setDraft = (id: string, key: string, val: unknown) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: val } }));

  return (
    <div className="master-forms">
      <div className="master-card">
        <h4>検査マイルストンにする工程</h4>
        <p className="mnote">
          タイムライン上で「検査マイルストン」とみなす工程の条件です。上から順に判定し、どれかに当てはまればマイルストンになります。
        </p>
        <p className="param-effect">変更すると：部品詳細タイムラインの検査マイルストン判定・期日（mdue）・色が変わります。</p>
        <div className="rule-list">
          {viewRows.map((row) => {
            const id = str(row.id);
            return (
              <div key={id} className={`rule-row ${row.active === false || row.active === 'false' ? 'off' : ''}`}>
                <label className="rule-active" title="有効">
                  <input
                    type="checkbox"
                    checked={row.active === true || row.active === 'true'}
                    onChange={(e) => setDraft(id, 'active', e.target.checked)}
                  />
                </label>
                <select
                  value={str(row.match_type)}
                  onChange={(e) => setDraft(id, 'match_type', e.target.value)}
                >
                  {MATCH_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {MATCH_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="パターン"
                  value={str(row.pattern)}
                  onChange={(e) => setDraft(id, 'pattern', e.target.value)}
                />
                <input
                  type="text"
                  placeholder="名称（任意・表示用）"
                  value={str(row.label)}
                  onChange={(e) => setDraft(id, 'label', e.target.value)}
                />
                <div className="rule-actions">
                  <UpdatedMeta row={row} />
                  <button
                    type="button"
                    className="mbtn save"
                    onClick={async () => {
                      await onSave({ id: row.id, ...row, ...(drafts[id] ?? {}) }, false);
                      setDrafts((p) => {
                        const n = { ...p };
                        delete n[id];
                        return n;
                      });
                    }}
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    className="mbtn del"
                    disabled={row.id == null || row.id === ''}
                    onClick={() => onDelete(row.id)}
                  >
                    削除
                  </button>
                </div>
              </div>
            );
          })}
          <div className="rule-row new">
            <span className="rule-active" />
            <select
              value={str(newRow.match_type)}
              onChange={(e) => setNewRow((p) => ({ ...p, match_type: e.target.value }))}
            >
              {MATCH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MATCH_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="パターン"
              value={str(newRow.pattern)}
              onChange={(e) => setNewRow((p) => ({ ...p, pattern: e.target.value }))}
            />
            <input
              type="text"
              placeholder="名称（任意）"
              value={str(newRow.label)}
              onChange={(e) => setNewRow((p) => ({ ...p, label: e.target.value }))}
            />
            <div className="rule-actions">
              {str(newRow.pattern).trim() && (
                <span className="new-row-preview">
                  {newRowPreview.length > 0
                    ? `プレビュー: ${newRowPreview.length}件ヒット（例: ${newRowPreview[0].shop} / ${newRowPreview[0].name}）`
                    : 'プレビュー: 該当工程なし'}
                </span>
              )}
              <button
                type="button"
                className="mbtn add"
                onClick={async () => {
                  await onSave({ ...newRow, active: true }, true);
                  setNewRow({ match_type: 'name_contains', pattern: '', label: '', active: true });
                }}
              >
                ＋追加
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="master-card">
        <h4>当たりそうな工程（プレビュー）</h4>
        <p className="mnote">有効ルールと、追加行の入力内容を含めた試算です（最大8件）。</p>
        {samples.length === 0 ? (
          <p className="mnote">該当する工程がありません。ルールやデータを確認してください。</p>
        ) : (
          <div className="table-wrap">
            <table className="mtable">
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>作業名称</th>
                  <th>例の部品</th>
                  <th>当たったルール</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((s, i) => (
                  <tr key={i}>
                    <td>{s.shop}</td>
                    <td>{s.name}</td>
                    <td>{s.partNo}</td>
                    <td>{s.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
