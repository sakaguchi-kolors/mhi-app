import { useDeferredValue, useMemo, useState, useTransition } from 'react';
import type { Row } from './shared';
import { str } from './shared';
import { UpdatedMeta } from './RowHistory';
import { Loading } from '../Loading';

type Props = {
  rows: Row[];
  onSaveBatch: (rows: Row[]) => Promise<boolean>;
};

type Flags = { is_milestone: boolean; gaic: boolean; archived: boolean };

type SortKey = 'shop' | 'job' | 'name' | 'source' | 'in_use' | 'last_used_at';
type SortDir = 'asc' | 'desc';

function bool(v: unknown): boolean {
  return v === true || v === 'true';
}

function rowFlags(row: Row): Flags {
  return {
    is_milestone: bool(row.is_milestone),
    gaic: bool(row.gaic),
    archived: bool(row.archived),
  };
}

function sourceLabel(source: unknown): string {
  return String(source) === 'flexsche' ? 'FLEXSCHE' : 'SHOP_JOB';
}

function fmtDate(v: unknown): string {
  const s = str(v);
  if (!s) return '—';
  return s.slice(0, 10);
}

function compareRows(a: Row, b: Row, key: SortKey, dir: SortDir): number {
  let cmp = 0;
  switch (key) {
    case 'in_use':
      cmp = Number(bool(a.in_use)) - Number(bool(b.in_use));
      break;
    case 'last_used_at': {
      const da = str(a.last_used_at);
      const db = str(b.last_used_at);
      if (!da && !db) cmp = 0;
      else if (!da) cmp = 1;
      else if (!db) cmp = -1;
      else cmp = da.localeCompare(db);
      break;
    }
    case 'source':
      cmp = sourceLabel(a.source).localeCompare(sourceLabel(b.source), 'ja');
      break;
    default:
      cmp = str(a[key]).localeCompare(str(b[key]), 'ja');
  }
  return dir === 'asc' ? cmp : -cmp;
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  disabled,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  disabled?: boolean;
}) {
  const active = activeKey === sortKey;
  return (
    <th>
      <button
        type="button"
        className={`milestone-sort${active ? ' active' : ''}`}
        disabled={disabled}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span className="milestone-sort-icon" aria-hidden>
          {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}

export function MilestoneEditor({ rows, onSaveBatch }: Props) {
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Record<string, Flags>>({});
  const [saving, setSaving] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('shop');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [sorting, startSortTransition] = useTransition();
  const deferredSortKey = useDeferredValue(sortKey);
  const deferredSortDir = useDeferredValue(sortDir);
  const sortingBusy = sorting || deferredSortKey !== sortKey || deferredSortDir !== sortDir;

  const resolveFlags = (row: Row): Flags => {
    const id = str(row.shop_job);
    return draft[id] ?? rowFlags(row);
  };

  const handleSort = (key: SortKey) => {
    startSortTransition(() => {
      if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      else {
        setSortKey(key);
        setSortDir('asc');
      }
    });
  };

  const tabRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      const archived = resolveFlags(r).archived;
      if (tab === 'active' ? archived : !archived) return false;
      if (!q) return true;
      const hay = `${str(r.shop)} ${str(r.job)} ${str(r.name)} ${sourceLabel(r.source)}`.toLowerCase();
      return hay.includes(q);
    });
    return [...filtered].sort((a, b) => compareRows(a, b, deferredSortKey, deferredSortDir));
  }, [rows, filter, tab, draft, deferredSortKey, deferredSortDir]);

  const dirtyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, flags] of Object.entries(draft)) {
      const row = rows.find((r) => str(r.shop_job) === id);
      if (!row) continue;
      const orig = rowFlags(row);
      if (
        flags.is_milestone !== orig.is_milestone ||
        flags.gaic !== orig.gaic ||
        flags.archived !== orig.archived
      ) {
        ids.add(id);
      }
    }
    return ids;
  }, [draft, rows]);

  const counts = useMemo(() => {
    let ms = 0;
    let gaic = 0;
    let flexsche = 0;
    let active = 0;
    let archived = 0;
    let inUse = 0;
    for (const r of rows) {
      const f = resolveFlags(r);
      if (f.is_milestone) ms++;
      if (f.gaic) gaic++;
      if (String(r.source) === 'flexsche') flexsche++;
      if (f.archived) archived++;
      else active++;
      if (bool(r.in_use)) inUse++;
    }
    return { total: rows.length, ms, gaic, flexsche, active, archived, inUse };
  }, [rows, draft]);

  const patchDraft = (row: Row, patch: Partial<Flags>) => {
    const id = str(row.shop_job);
    const current = resolveFlags(row);
    const next = { ...current, ...patch };
    const orig = rowFlags(row);
    if (
      next.is_milestone === orig.is_milestone &&
      next.gaic === orig.gaic &&
      next.archived === orig.archived
    ) {
      setDraft((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    } else {
      setDraft((prev) => ({ ...prev, [id]: next }));
    }
  };

  const toggle = (row: Row, key: 'is_milestone' | 'gaic', on: boolean) => {
    const current = resolveFlags(row);
    patchDraft(row, { ...current, [key]: on });
  };

  const buildSaveRow = (row: Row, flags: Flags): Row => ({
    shop: row.shop,
    job: row.job,
    shop_job: row.shop_job,
    name: row.name,
    is_milestone: flags.is_milestone,
    gaic: flags.gaic,
    archived: flags.archived,
  });

  const handleSave = async () => {
    if (dirtyIds.size === 0 || saving) return;
    const changedRows: Row[] = [];
    for (const id of dirtyIds) {
      const row = rows.find((r) => str(r.shop_job) === id);
      const flags = draft[id];
      if (!row || !flags) continue;
      changedRows.push(buildSaveRow(row, flags));
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

  const saveArchiveChange = async (row: Row, archived: boolean) => {
    if (saving) return;
    const flags = { ...resolveFlags(row), archived };
    setSaving(true);
    try {
      const ok = await onSaveBatch([buildSaveRow(row, flags)]);
      if (ok) {
        setDraft((prev) => {
          const n = { ...prev };
          delete n[str(row.shop_job)];
          return n;
        });
      }
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
          取込時に<b>利用中</b>でない工程（JND(実績)が空でJND(計算)もない等）は<b>過去マスタ</b>へ自動退避されます。
          チェックを付けた行がタイムライン上で ◎（工程マイルストン）または 外（外注）として表示されます。
        </p>
        <p className="param-effect">
          チェックを付けたあと、右下の「更新」で保存・反映します。反映後、部品詳細タイムラインの ◎ / 外 判定・検査期日（mdue）・外注ステータス色が変わります。
        </p>
        <div className="milestone-tabs">
          <button
            type="button"
            className={`milestone-tab${tab === 'active' ? ' active' : ''}`}
            onClick={() => setTab('active')}
          >
            現行 ({counts.active})
          </button>
          <button
            type="button"
            className={`milestone-tab${tab === 'archived' ? ' active' : ''}`}
            onClick={() => setTab('archived')}
          >
            過去マスタ ({counts.archived})
          </button>
        </div>
        <div className="param-preview">
          <div className="param-preview-row">
            <span>工程数</span>
            <span className="pill yellow">{counts.total} 行</span>
            <span>利用中</span>
            <span className="pill green">{counts.inUse}</span>
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
                表示 {tabRows.length} / {tab === 'active' ? counts.active : counts.archived}
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
        <div className="master-card panel-loading-wrap">
          {sortingBusy && <Loading variant="veil" label="並び替え中…" />}
          <div className={`table-wrap${sortingBusy ? ' table-wrap-busy' : ''}`}>
            <table className="mtable milestone-grid">
              <thead>
                <tr>
                  <SortHeader label="SHOP" sortKey="shop" activeKey={sortKey} dir={sortDir} onSort={handleSort} disabled={sortingBusy || saving} />
                  <SortHeader label="JOB" sortKey="job" activeKey={sortKey} dir={sortDir} onSort={handleSort} disabled={sortingBusy || saving} />
                  <SortHeader label="作業名称" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} disabled={sortingBusy || saving} />
                  <SortHeader label="取得元" sortKey="source" activeKey={sortKey} dir={sortDir} onSort={handleSort} disabled={sortingBusy || saving} />
                  <SortHeader label="利用中" sortKey="in_use" activeKey={sortKey} dir={sortDir} onSort={handleSort} disabled={sortingBusy || saving} />
                  <SortHeader label="最終利用日" sortKey="last_used_at" activeKey={sortKey} dir={sortDir} onSort={handleSort} disabled={sortingBusy || saving} />
                  <th className="mcol" title="工程マイルストン（◎）">
                    工程MS
                  </th>
                  <th className="mcol" title="外注（外）">
                    外注
                  </th>
                  <th className="mcol">操作</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {tabRows.map((row) => {
                  const id = str(row.shop_job);
                  const flags = resolveFlags(row);
                  const dirty = dirtyIds.has(id);
                  const inUse = bool(row.in_use);
                  return (
                    <tr key={id} className={dirty ? 'row-dirty' : undefined}>
                      <td>{str(row.shop)}</td>
                      <td>{str(row.job)}</td>
                      <td>{str(row.name) || '—'}</td>
                      <td className="mcell">
                        <span className={`source-tag ${String(row.source) === 'flexsche' ? 'flexsche' : 'shop-job'}`}>
                          {sourceLabel(row.source)}
                        </span>
                      </td>
                      <td className="mcell">
                        <span className={`usage-tag${inUse ? ' in-use' : ''}`}>{inUse ? '利用中' : '—'}</span>
                      </td>
                      <td className="mcell">{inUse ? '—' : fmtDate(row.last_used_at)}</td>
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
                      <td className="mcell">
                        {tab === 'active' ? (
                          <button
                            type="button"
                            className="mbtn small"
                            disabled={saving}
                            onClick={() => saveArchiveChange(row, true)}
                          >
                            過去へ
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="mbtn small"
                            disabled={saving}
                            onClick={() => saveArchiveChange(row, false)}
                          >
                            戻す
                          </button>
                        )}
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
          {tabRows.length === 0 && (
            <p className="mnote" style={{ marginTop: 8 }}>
              {filter ? '絞り込み条件に一致する工程がありません。' : tab === 'active' ? '現行タブに表示する工程がありません。' : '過去マスタに登録された工程がありません。'}
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
