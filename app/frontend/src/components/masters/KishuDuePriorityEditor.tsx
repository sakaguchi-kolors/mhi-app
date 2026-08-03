import { useMemo, useState } from 'react';
import type { Row } from './shared';
import { str } from './shared';
import { MasterEditorShell } from './MasterEditorShell';
import { UpdatedMeta } from './RowHistory';
import { useMasterDrafts } from './useMasterDrafts';

type Props = {
  rows: Row[];
  defaultDueSource: string;
  onSave: (row: Row, isNew: boolean) => Promise<boolean>;
  onDelete: (kishu: string) => Promise<boolean>;
};

const SOURCE_LABEL: Record<string, string> = {
  flexsche: '小日程（FlexSche JND）',
  octopus: 'OCTPuS（JND）',
  pbs: '計画納期（PBS）',
};

const DEFAULT_ORDER: Record<string, [string, string, string]> = {
  flexsche: ['flexsche', 'pbs', 'octopus'],
  pbs: ['pbs', 'flexsche', 'octopus'],
};

function draftPriority(row: Row, key: string, fallback: string): string {
  return str(row[key]) || fallback;
}

export function KishuDuePriorityEditor({ rows, defaultDueSource, onSave, onDelete }: Props) {
  const { viewRows, patchDraft, clearDraft } = useMasterDrafts(rows, (r) => str(r.kishu));
  const [busy, setBusy] = useState<string | null>(null);

  const defaultOrder = DEFAULT_ORDER[defaultDueSource] ?? DEFAULT_ORDER.flexsche;

  const sortedRows = useMemo(
    () => [...viewRows].sort((a, b) => str(a.kishu).localeCompare(str(b.kishu))),
    [viewRows],
  );

  const configuredCount = useMemo(
    () => sortedRows.filter((r) => str(r.priority_1) && str(r.priority_2) && str(r.priority_3)).length,
    [sortedRows],
  );

  const saveRow = async (row: Row) => {
    const kishu = str(row.kishu);
    if (!kishu) return;
    setBusy(kishu);
    try {
      const ok = await onSave(
        {
          ...row,
          priority_1: draftPriority(row, 'priority_1', defaultOrder[0]),
          priority_2: draftPriority(row, 'priority_2', defaultOrder[1]),
          priority_3: draftPriority(row, 'priority_3', defaultOrder[2]),
        },
        false,
      );
      if (ok) clearDraft(kishu);
    } finally {
      setBusy(null);
    }
  };

  const resetRow = async (kishu: string) => {
    if (!confirm(`機種「${kishu}」の優先順位設定を解除し、全体デフォルトに戻しますか？`)) return;
    setBusy(kishu);
    try {
      const ok = await onDelete(kishu);
      if (ok) clearDraft(kishu);
    } finally {
      setBusy(null);
    }
  };

  return (
    <MasterEditorShell
      title="機種別納期優先順位"
      note="機種ごとに最終納期候補（小日程 / OCTPuS / 計画納期）の優先順位を設定します。未設定の機種はパラメータの「最終納期の採用元」（2択）を使います。"
    >
      <p className="param-effect">
        保存後：該当機種の部品について、最終納期・残日数・バッファ・色が更新されます。
      </p>
      <div className="param-preview">
        <div className="param-preview-row">
          <span>個別設定済み</span>
          <span className="pill yellow">{configuredCount} 機種</span>
          <span className="mnote" style={{ margin: 0 }}>
            全体デフォルト: {defaultDueSource === 'pbs' ? 'PBS → 小日程' : '小日程 → PBS'}
          </span>
        </div>
      </div>
      <div className="table-wrap">
        <table className="mtable">
          <thead>
            <tr>
              <th>機種</th>
              <th>第1優先</th>
              <th>第2優先</th>
              <th>第3優先</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const kishu = str(row.kishu);
              const configured = !!(str(row.priority_1) && str(row.priority_2) && str(row.priority_3));
              const p1 = draftPriority(row, 'priority_1', configured ? str(row.priority_1) : defaultOrder[0]);
              const p2 = draftPriority(row, 'priority_2', configured ? str(row.priority_2) : defaultOrder[1]);
              const p3 = draftPriority(row, 'priority_3', configured ? str(row.priority_3) : defaultOrder[2]);
              const dirty =
                p1 !== str(row.priority_1) ||
                p2 !== str(row.priority_2) ||
                p3 !== str(row.priority_3);
              return (
                <tr key={kishu} className={configured ? '' : 'row-muted'}>
                  <td>
                    <strong>{kishu}</strong>
                    {!configured && <div className="mnote">デフォルト使用</div>}
                  </td>
                  {(['priority_1', 'priority_2', 'priority_3'] as const).map((key, i) => {
                    const val = [p1, p2, p3][i];
                    return (
                      <td key={key}>
                        <select
                          value={val}
                          onChange={(e) => patchDraft(kishu, { [key]: e.target.value })}
                          disabled={busy === kishu}
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
                      disabled={busy === kishu || (configured && !dirty)}
                      onClick={() => saveRow({ ...row, priority_1: p1, priority_2: p2, priority_3: p3 })}
                    >
                      保存
                    </button>
                    {configured && (
                      <button
                        type="button"
                        className="mbtn"
                        disabled={busy === kishu}
                        onClick={() => resetRow(kishu)}
                      >
                        解除
                      </button>
                    )}
                    <UpdatedMeta row={row} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </MasterEditorShell>
  );
}
