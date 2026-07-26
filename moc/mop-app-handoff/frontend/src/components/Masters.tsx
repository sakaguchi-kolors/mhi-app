import { useEffect, useMemo, useState } from 'react';
import type { MasterDef, ColDef, AuditRow } from '../types';
import * as api from '../api';
import type { ToastState } from './Toast';

type Row = Record<string, unknown>;

function emptyRow(def: MasterDef): Row {
  const r: Row = {};
  for (const c of def.columns) r[c.key] = c.type === 'bool' ? true : '';
  return r;
}

export function Masters({ onRecompute, toast }: { onRecompute: () => Promise<void>; toast: ToastState }) {
  const [defs, setDefs] = useState<MasterDef[]>([]);
  const [cur, setCur] = useState<string>('');
  const [rows, setRows] = useState<Row[]>([]);
  const [newRow, setNewRow] = useState<Row>({});
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [recomputing, setRecomputing] = useState(false);

  const def = useMemo(() => defs.find((d) => d.name === cur), [defs, cur]);

  useEffect(() => {
    api.getMasters().then((d) => { setDefs(d); if (!cur && d.length) setCur(d[0].name); })
      .catch((e) => { console.error(e); toast.show('マスタ定義の取得に失敗しました'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRows = async (name: string, d: MasterDef[] = defs) => {
    const r = await api.getMasterRows(name);
    setRows(r);
    const def2 = d.find((x) => x.name === name);
    if (def2) setNewRow(emptyRow(def2));
  };
  const loadAudit = () => api.getAudit().then(setAudit).catch(() => setAudit([]));

  useEffect(() => {
    if (cur) {
      loadRows(cur).catch((e) => { console.error(e); toast.show('マスタの取得に失敗しました'); });
      loadAudit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, defs]);

  if (!def) return <section><div className="page-head"><div><h2>マスタ管理</h2></div></div><p style={{ color: 'var(--muted)' }}>読み込み中…</p></section>;

  const setCell = (i: number, key: string, val: unknown) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: val } : r)));

  const save = async (row: Row, isNew: boolean) => {
    try {
      await api.saveMasterRow(cur, row);
      toast.show('保存しました');
      await loadRows(cur); await loadAudit();
      if (isNew) setNewRow(emptyRow(def));
    } catch (e) {
      console.error(e); toast.show('保存に失敗しました');
    }
  };
  const del = async (pkVal: unknown) => {
    if (!confirm('削除しますか？')) return;
    try {
      await api.deleteMasterRow(cur, String(pkVal));
      toast.show('削除しました');
      await loadRows(cur); await loadAudit();
    } catch (e) {
      console.error(e); toast.show('削除に失敗しました');
    }
  };
  const doRecompute = async () => { setRecomputing(true); try { await onRecompute(); await loadAudit(); } finally { setRecomputing(false); } };

  return (
    <section>
      <div className="page-head">
        <div><h2>マスタ管理</h2><p>参照・設定系マスタの保守。編集後は「再計算」で算出へ反映されます。</p></div>
        <button className="back-btn" onClick={doRecompute} disabled={recomputing}>{recomputing ? '再計算中…' : '🔄 再計算して反映'}</button>
      </div>

      <div className="toolbar">
        {(['edit', 'import'] as const).flatMap((grp) =>
          defs.filter((d) => d.group === grp && d.name !== 'owner').map((d) => (
            <span key={d.name} className={`mtab ${d.name === cur ? 'active' : ''}`} onClick={() => setCur(d.name)}>
              {d.label}<span className="g">{grp === 'edit' ? '画面編集' : '取込'}</span>
            </span>
          )),
        )}
      </div>

      <div className="panel">
        <p className="mnote">{def.note}</p>
        <div className="table-wrap">
          <table className="mtable">
            <thead>
              <tr>{def.columns.map((c) => <th key={c.key}>{c.label}</th>)}<th /></tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={String(row[def.pk]) + i}>
                  {def.columns.map((c) => <td key={c.key}>{cellInput(c, row[c.key], (v) => setCell(i, c.key, v), false)}</td>)}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="mbtn save" onClick={() => save(row, false)}>保存</button>{' '}
                    <button className="mbtn del" onClick={() => del(row[def.pk])}>削除</button>
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f7faff' }}>
                {def.columns.map((c) => <td key={c.key}>{cellInput(c, newRow[c.key], (v) => setNewRow((p) => ({ ...p, [c.key]: v })), true)}</td>)}
                <td><button className="mbtn add" onClick={() => save(newRow, true)}>＋追加</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 className="pt">操作履歴（監査ログ・直近）</h3>
        <div className="table-wrap">
          <table>
            <tbody id="auditBody">
              {audit.slice(0, 12).map((r, i) => (
                <tr key={i}>
                  <td>{String(r.at ?? '').replace('T', ' ').slice(0, 16)}</td>
                  <td>{r.app_user}</td><td>{r.action}</td><td>{r.target} {r.ref}</td>
                </tr>
              ))}
              {audit.length === 0 && <tr><td style={{ padding: 12 }}>履歴なし</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function cellInput(c: ColDef, val: unknown, onChange: (v: unknown) => void, isNew: boolean) {
  const disabled = c.readonly && !isNew;
  if (c.type === 'bool') return <input type="checkbox" checked={val === true || val === 'true'} onChange={(e) => onChange(e.target.checked)} />;
  if (c.type === 'number') return <input type="number" step="any" value={val == null ? '' : String(val)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  if (c.type === 'date') return <input type="date" value={val == null ? '' : String(val).slice(0, 10)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  if (c.type === 'select') return <select value={val == null ? '' : String(val)} onChange={(e) => onChange(e.target.value)}>{(c.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  return <input type="text" value={val == null ? '' : String(val)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
}
