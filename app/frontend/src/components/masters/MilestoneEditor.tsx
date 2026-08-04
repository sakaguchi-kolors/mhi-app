import { useMemo, useState } from 'react';
import type { Row } from './shared';
import { str } from './shared';
import { UpdatedMeta } from './RowHistory';

type Props = {
  rows: Row[];
  onSaveBatch: (rows: Row[]) => Promise<boolean>;
};

type Flags = { is_milestone: boolean; gaic: boolean };

function bool(v: unknown): boolean {
  return v === true || v === 'true';
}

function rowFlags(row: Row): Flags {
  return { is_milestone: bool(row.is_milestone), gaic: bool(row.gaic) };
}

function sourceLabel(source: unknown): string {
  return String(source) === 'flexsche' ? 'FLEXSCHE' : 'SHOP_JOB';
}

export function MilestoneEditor({ rows, onSaveBatch }: Props) {
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Record<string, Flags>>({});
  const [saving, setSaving] = useState(false);

  const resolveFlags = (row: Row): Flags => {
    const id = str(row.shop_job);
    return draft[id] ?? rowFlags(row);
  };

  const viewRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const sorted = [...rows].sort((a, b) => {
      const sa = `${str(a.shop)}::${str(a.job)}`;
      const sb = `${str(b.shop)}::${str(b.job)}`;
      return sa.localeCompare(sb, 'ja');
    });
    if (!q) return sorted;
    return sorted.filter((r) => {
      const hay = `${str(r.shop)} ${str(r.job)} ${str(r.name)} ${sourceLabel(r.source)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter]);

  const dirtyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, flags] of Object.entries(draft)) {
      const row = rows.find((r) => str(r.shop_job) === id);
      if (!row) continue;
      const orig = rowFlags(row);
      if (flags.is_milestone !== orig.is_milestone || flags.gaic !== orig.gaic) {
        ids.add(id);
      }
    }
    return ids;
  }, [draft, rows]);

  const counts = useMemo(() => {
    let ms = 0;
    let gaic = 0;
    let flexsche = 0;
    for (const r of rows) {
      const f = resolveFlags(r);
      if (f.is_milestone) ms++;
      if (f.gaic) gaic++;
      if (String(r.source) === 'flexsche') flexsche++;
    }
    return { total: rows.length, ms, gaic, flexsche };
  }, [rows, draft]);

  const toggle = (row: Row, key: 'is_milestone' | 'gaic', on: boolean) => {
    const id = str(row.shop_job);
    const current = resolveFlags(row);
    const next = { ...current, [key]: on };
    const orig = rowFlags(row);
    if (next.is_milestone === orig.is_milestone && next.gaic === orig.gaic) {
      setDraft((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    } else {
      setDraft((prev) => ({ ...prev, [id]: next }));
    }
  };

  const handleSave = async () => {
    if (dirtyIds.size === 0 || saving) return;
    const changedRows: Row[] = [];
    for (const id of dirtyIds) {
      const row = rows.find((r) => str(r.shop_job) === id);
      const flags = draft[id];
      if (!row || !flags) continue;
      changedRows.push({
        shop: row.shop,
        job: row.job,
        shop_job: row.shop_job,
        name: row.name,
        is_milestone: flags.is_milestone,
        gaic: flags.gaic,
      });
    }
    if (!changedRows.length) return;

    setSaving(true);
    try {
      const ok = await onSaveBatch(changedRows);
      if (ok) setDraft({});
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="master-forms">
      <div className="master-card">
        <h4>工程マイルストン・外注の指定</h4>
        <p className="mnote">
          SHOP_JOBマスタ（CSV取込）を基本とし、FLEXSCHEにのみ存在する工程は取込時に自動補完されます。
          チェックを付けた行がタイムライン上で ◎（工程マイルストン）または 外（外注）として表示されます。
        </p>
        <p className="param-effect">
          チェックを付けたあと、右下の「更新」で保存・反映します。反映後、部品詳細タイムラインの ◎ / 外 判定・検査期日（mdue）・外注ステータス色が変わります。
        </p>
        <div className="param-preview">
          <div className="param-preview-row">
            <span>工程数</span>
            <span className="pill yellow">{counts.total} 行</span>
            <span>工程MS</span>
            <span className="pill green">{counts.ms}</span>
            <span>外注</span>
            <span className="pill green">{counts.gaic}</span>
            <span>FLEXSCHE補完</span>
            <span className="pill yellow">{counts.flexsche}</span>
            {dirtyIds.size > 0 && (
              <span className="param-delta">未保存 {dirtyIds.size} 行</span>
            )}
          </div>
          <div className="param-preview-row" style={{ marginTop: 8 }}>
            <input
              type="search"
              className="milestone-filter"
              placeholder="SHOP / JOB / 作業名称 / 取得元で絞り込み"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {filter && (
              <span className="param-delta ok">
                表示 {viewRows.length} / {counts.total}
              </span>
            )}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="master-card">
          <p className="mnote">
            SHOP_JOBマスタが未取込です。データ取込で <b>SHOP_JOBマスタ.csv</b> と <b>FLEXSCHE</b> を取り込むと、ここに工程一覧が表示されます（FLEXSCHEのみの工程も自動補完されます）。
          </p>
        </div>
      ) : (
        <div className="master-card">
          <div className="table-wrap">
            <table className="mtable milestone-grid">
              <thead>
                <tr>
                  <th className="sticky-col">SHOP</th>
                  <th>JOB</th>
                  <th>作業名称</th>
                  <th className="mcol">取得元</th>
                  <th className="mcol" title="工程マイルストン（◎）">
                    工程MS
                  </th>
                  <th className="mcol" title="外注（外）">
                    外注
                  </th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {viewRows.map((row) => {
                  const id = str(row.shop_job);
                  const flags = resolveFlags(row);
                  const dirty = dirtyIds.has(id);
                  return (
                    <tr key={id} className={dirty ? 'row-dirty' : undefined}>
                      <td className="sticky-col">{str(row.shop)}</td>
                      <td>{str(row.job)}</td>
                      <td>{str(row.name) || '—'}</td>
                      <td className="mcell">
                        <span className={`source-tag ${String(row.source) === 'flexsche' ? 'flexsche' : 'shop-job'}`}>
                          {sourceLabel(row.source)}
                        </span>
                      </td>
                      <td className="mcell">
                        <input
                          type="checkbox"
                          checked={flags.is_milestone}
                          disabled={saving}
                          onChange={(e) => toggle(row, 'is_milestone', e.target.checked)}
                        />
                      </td>
                      <td className="mcell">
                        <input
                          type="checkbox"
                          checked={flags.gaic}
                          disabled={saving}
                          onChange={(e) => toggle(row, 'gaic', e.target.checked)}
                        />
                      </td>
                      <td className="mhist">
                        <UpdatedMeta row={row} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {viewRows.length === 0 && filter && (
            <p className="mnote" style={{ marginTop: 8 }}>
              絞り込み条件に一致する工程がありません。
            </p>
          )}
        </div>
      )}

      <div className="milestone-save-bar">
        {dirtyIds.size > 0 && (
          <span className="milestone-save-hint">未保存 {dirtyIds.size} 行</span>
        )}
        <button
          type="button"
          className="mbtn save"
          disabled={dirtyIds.size === 0 || saving}
          onClick={handleSave}
        >
          {saving ? '更新中…' : '更新'}
        </button>
      </div>
    </div>
  );
}
