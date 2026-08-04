import { useMemo, useState } from 'react';
import type { Row } from './shared';
import { str } from './shared';
import { MasterEditorShell } from './MasterEditorShell';
import { UpdatedMeta } from './RowHistory';
import { useMasterDrafts } from './useMasterDrafts';

type Props = {
  rows: Row[];
  paramRows: Row[];
  onSave: (row: Row, isNew: boolean) => Promise<boolean>;
  onSaveDefault: (p1: string, p2: string, p3: string) => Promise<boolean>;
};

const SOURCE_LABEL: Record<string, string> = {
  flexsche: '小日程（FlexSche JND）',
  octopus: 'OCTPuS（JND）',
  pbs: '計画納期（PBS）',
};

const SOURCE_SHORT: Record<string, string> = {
  flexsche: '小日程',
  octopus: 'OCTPuS',
  pbs: '計画納期',
};

const PRIORITY_RANK_LABEL = ['第1優先', '第2優先', '第3優先'] as const;

const DEFAULT_PARAM_KEYS = ['KISHU_DUE_PRIORITY_1', 'KISHU_DUE_PRIORITY_2', 'KISHU_DUE_PRIORITY_3'] as const;
const FALLBACK_DEFAULT = ['pbs', 'flexsche', 'octopus'] as const;

type KishuMode = 'default' | 'custom';

function readDefaultFromParams(paramRows: Row[]): [string, string, string] {
  return [
    str(paramRows.find((r) => str(r.key) === DEFAULT_PARAM_KEYS[0])?.value) || FALLBACK_DEFAULT[0],
    str(paramRows.find((r) => str(r.key) === DEFAULT_PARAM_KEYS[1])?.value) || FALLBACK_DEFAULT[1],
    str(paramRows.find((r) => str(r.key) === DEFAULT_PARAM_KEYS[2])?.value) || FALLBACK_DEFAULT[2],
  ];
}

function formatPriority(p1: string, p2: string, p3: string): string {
  return [p1, p2, p3].map((v) => SOURCE_LABEL[v] ?? v).join(' → ');
}

function rowMode(row: Row): KishuMode {
  return str(row.mode) === 'custom' ? 'custom' : 'default';
}

export function KishuDuePriorityEditor({ rows, paramRows, onSave, onSaveDefault }: Props) {
  const { viewRows, patchDraft, clearDraft } = useMasterDrafts(rows, (r) => str(r.kishu));
  const [defaultDraft, setDefaultDraft] = useState<[string, string, string] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [defaultBusy, setDefaultBusy] = useState(false);

  const savedDefault = useMemo(() => readDefaultFromParams(paramRows), [paramRows]);
  const defaultOrder = defaultDraft ?? savedDefault;
  const defaultDirty =
    defaultOrder[0] !== savedDefault[0] ||
    defaultOrder[1] !== savedDefault[1] ||
    defaultOrder[2] !== savedDefault[2];

  const sortedRows = useMemo(
    () => [...viewRows].sort((a, b) => str(a.kishu).localeCompare(str(b.kishu))),
    [viewRows],
  );

  const customCount = useMemo(
    () => sortedRows.filter((r) => rowMode(r) === 'custom').length,
    [sortedRows],
  );

  const resolveMode = (row: Row): KishuMode => {
    const draftMode = str(row.mode);
    if (draftMode === 'custom' || draftMode === 'default') return draftMode;
    return rowMode(row);
  };

  const resolvePriority = (row: Row, key: 'priority_1' | 'priority_2' | 'priority_3', index: number): string => {
    if (resolveMode(row) === 'default') return defaultOrder[index];
    const draftVal = str(row[key]);
    if (draftVal) return draftVal;
    return defaultOrder[index];
  };

  const saveDefault = async () => {
    setDefaultBusy(true);
    try {
      const ok = await onSaveDefault(defaultOrder[0], defaultOrder[1], defaultOrder[2]);
      if (ok) setDefaultDraft(null);
    } finally {
      setDefaultBusy(false);
    }
  };

  const saveRow = async (row: Row) => {
    const kishu = str(row.kishu);
    if (!kishu) return;
    const mode = resolveMode(row);
    setBusy(kishu);
    try {
      const payload: Row = { ...row, kishu, mode };
      if (mode === 'custom') {
        payload.priority_1 = resolvePriority(row, 'priority_1', 0);
        payload.priority_2 = resolvePriority(row, 'priority_2', 1);
        payload.priority_3 = resolvePriority(row, 'priority_3', 2);
      }
      const ok = await onSave(payload, false);
      if (ok) clearDraft(kishu);
    } finally {
      setBusy(null);
    }
  };

  const isRowDirty = (row: Row): boolean => {
    const kishu = str(row.kishu);
    const saved = rows.find((r) => str(r.kishu) === kishu);
    if (!saved) return false;
    const mode = resolveMode(row);
    if (mode !== rowMode(saved)) return true;
    if (mode === 'default') return false;
    return (
      resolvePriority(row, 'priority_1', 0) !== str(saved.priority_1) ||
      resolvePriority(row, 'priority_2', 1) !== str(saved.priority_2) ||
      resolvePriority(row, 'priority_3', 2) !== str(saved.priority_3)
    );
  };

  return (
    <MasterEditorShell
      title="機種別納期優先順位"
      note="まず標準の優先順位を設定します。機種ごとに「標準に合わせる」か「個別設定する」を選べます。標準に合わせる機種は DB に個別値を持たず、標準変更に自動で追随します。"
    >
      <p className="param-effect">
        保存後：最終納期・残日数・バッファ・色が更新されます。標準を変更すると「標準に合わせる」機種すべてに反映されます。
      </p>

      <div className="master-card kishu-default-card">
        <h4>標準の優先順位</h4>
        <p className="mnote">新規機種および「標準に合わせる」機種が参照するデフォルト設定です。</p>
        <div className="kishu-priority-flow">
          {PRIORITY_RANK_LABEL.map((rankLabel, i) => (
            <div key={rankLabel} className="kishu-priority-flow-item">
              {i > 0 && <div className="kishu-priority-arrow" aria-hidden="true">→</div>}
              <div className="kishu-priority-step">
                <div className="kishu-priority-step-head">
                  <span className={`kishu-priority-rank${i === 0 ? ' primary' : ''}`}>{i + 1}</span>
                  <div>
                    <div className="kishu-priority-rank-label">{rankLabel}</div>
                    <span className={`kishu-priority-source-tag ${defaultOrder[i]}`}>
                      {SOURCE_SHORT[defaultOrder[i]] ?? defaultOrder[i]}
                    </span>
                  </div>
                </div>
                <select
                  className="kishu-priority-select"
                  value={defaultOrder[i]}
                  disabled={defaultBusy}
                  aria-label={rankLabel}
                  onChange={(e) => {
                    const next: [string, string, string] = [...defaultOrder] as [string, string, string];
                    next[i] = e.target.value;
                    setDefaultDraft(next);
                  }}
                >
                  {Object.entries(SOURCE_LABEL).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
        <div className="kishu-default-actions">
          <div className="kishu-priority-preview">
            <span className="kishu-priority-preview-label">採用順</span>
            {defaultOrder.map((v, i) => (
              <span key={`${v}-${i}`} className="kishu-priority-preview-chain">
                {i > 0 && <span className="kishu-priority-preview-arrow">→</span>}
                <span className={`kishu-priority-source-tag ${v}`}>{SOURCE_SHORT[v] ?? v}</span>
              </span>
            ))}
            {defaultDirty && <span className="param-delta">未保存</span>}
          </div>
          <button type="button" className="mbtn save" disabled={!defaultDirty || defaultBusy} onClick={saveDefault}>
            {defaultBusy ? '保存中…' : '標準を保存'}
          </button>
        </div>
      </div>

      <div className="master-card">
        <h4>機種別設定</h4>
        <div className="param-preview">
          <div className="param-preview-row">
            <span>機種数</span>
            <span className="pill yellow">{sortedRows.length}</span>
            <span>個別設定</span>
            <span className="pill green">{customCount}</span>
            <span>標準に合わせる</span>
            <span className="pill green">{sortedRows.length - customCount}</span>
          </div>
        </div>
        <div className="table-wrap">
          <table className="mtable">
            <thead>
              <tr>
                <th>機種</th>
                <th>設定</th>
                <th>第1優先</th>
                <th>第2優先</th>
                <th>第3優先</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const kishu = str(row.kishu);
                const mode = resolveMode(row);
                const isCustom = mode === 'custom';
                const p1 = resolvePriority(row, 'priority_1', 0);
                const p2 = resolvePriority(row, 'priority_2', 1);
                const p3 = resolvePriority(row, 'priority_3', 2);
                const dirty = isRowDirty(row);
                return (
                  <tr key={kishu} className={!isCustom ? 'row-muted' : dirty ? 'row-dirty' : ''}>
                    <td>
                      <strong>{kishu}</strong>
                    </td>
                    <td>
                      <select
                        value={mode}
                        disabled={busy === kishu}
                        onChange={(e) => {
                          const nextMode = e.target.value as KishuMode;
                          if (nextMode === 'custom') {
                            patchDraft(kishu, {
                              mode: 'custom',
                              priority_1: p1,
                              priority_2: p2,
                              priority_3: p3,
                            });
                          } else {
                            patchDraft(kishu, { mode: 'default' });
                          }
                        }}
                      >
                        <option value="default">標準に合わせる</option>
                        <option value="custom">個別設定する</option>
                      </select>
                    </td>
                    {(['priority_1', 'priority_2', 'priority_3'] as const).map((key, i) => {
                      const val = [p1, p2, p3][i];
                      return (
                        <td key={key}>
                          <select
                            value={val}
                            disabled={!isCustom || busy === kishu}
                            onChange={(e) => patchDraft(kishu, { [key]: e.target.value })}
                          >
                            {Object.entries(SOURCE_LABEL).map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                    <td className="actions">
                      <button
                        type="button"
                        className="mbtn save"
                        disabled={busy === kishu || !dirty}
                        onClick={() => saveRow(row)}
                      >
                        保存
                      </button>
                      {!isCustom && (
                        <div className="mnote">標準: {formatPriority(defaultOrder[0], defaultOrder[1], defaultOrder[2])}</div>
                      )}
                      {isCustom && <UpdatedMeta row={row} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </MasterEditorShell>
  );
}
