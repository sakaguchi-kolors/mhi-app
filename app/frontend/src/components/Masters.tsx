import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MasterDef, AuditRow, Part } from '../types';
import * as api from '../api';
import { routes } from '../routes';
import type { ToastState } from './Toast';
import { MasterTable } from './masters/MasterTable';
import { ParamEditor } from './masters/ParamEditor';
import { MilestoneEditor } from './masters/MilestoneEditor';
import { ShopLtEditor } from './masters/ShopLtEditor';
import { CalendarEditor } from './masters/CalendarEditor';
import { VendorEditor } from './masters/VendorEditor';
import { CategoryEditor } from './masters/CategoryEditor';
import {
  type Row,
  RECOMPUTE_MASTERS,
  colorCounts,
  fmtDateTime,
  loadLastRecompute,
  loadPending,
  num,
  saveLastRecompute,
  savePending,
  str,
} from './masters/shared';

function emptyRow(def: MasterDef): Row {
  const r: Row = {};
  for (const c of def.columns) r[c.key] = c.type === 'bool' ? true : '';
  return r;
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return `${fallback}（${e.message}）`;
  return fallback;
}

const TAB_BLURB: Record<string, string> = {
  param: '緊急度の色・所要日数・納期の採用元など、算出の係数を設定します。',
  milestone: 'タイムライン上で検査マイルストンとみなす工程の条件です。',
  shop_lt: 'Shopごとの所要日数の例外設定です。未登録は既定LTを使います。',
  calendar: '休日を登録すると、残日数計算からその日を除外します。',
  vendor: '注文番号から外注先名を表示するための対応表です。',
  category: '部品番号から完成品分類を決めるルールです。',
};

type Props = {
  parts: Part[];
  onRecompute: () => Promise<void>;
  onReload?: () => Promise<void>;
  toast: ToastState;
};

export function Masters({ parts, onRecompute, onReload, toast }: Props) {
  const { name: routeName } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [defs, setDefs] = useState<MasterDef[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [newRow, setNewRow] = useState<Row>({});
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [recomputing, setRecomputing] = useState(false);
  const [pending, setPending] = useState<string[]>(() => loadPending());
  const [lastRecompute, setLastRecompute] = useState<string | null>(() => loadLastRecompute());
  const [paramRows, setParamRows] = useState<Row[]>([]);

  const cur = routeName ?? '';
  const def = useMemo(() => defs.find((d) => d.name === cur), [defs, cur]);
  const labelOf = (name: string) => defs.find((d) => d.name === name)?.label ?? name;

  useEffect(() => {
    api
      .getMasters()
      .then((d) => {
        setDefs(d);
        if (!routeName || !d.some((x) => x.name === routeName)) {
          navigate(routes.master(d[0]?.name ?? 'param'), { replace: true });
        }
      })
      .catch((e) => {
        console.error(e);
        toast.show('マスタ定義の取得に失敗しました');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!defs.length || !routeName) return;
    if (!defs.some((d) => d.name === routeName)) {
      navigate(routes.master(defs[0].name), { replace: true });
    }
  }, [defs, routeName, navigate]);

  const loadRows = async (name: string, d: MasterDef[] = defs) => {
    const r = await api.getMasterRows(name);
    setRows(r);
    const def2 = d.find((x) => x.name === name);
    if (def2) setNewRow(emptyRow(def2));
    if (name === 'param') setParamRows(r);
  };
  const loadAudit = () => api.getAudit().then(setAudit).catch(() => setAudit([]));
  const ensureParamRows = async () => {
    if (paramRows.length) return paramRows;
    const r = await api.getMasterRows('param');
    setParamRows(r);
    return r;
  };

  useEffect(() => {
    if (cur && defs.some((d) => d.name === cur)) {
      loadRows(cur).catch((e) => {
        console.error(e);
        toast.show(errMsg(e, 'マスタの取得に失敗しました'));
      });
      loadAudit();
      if (cur !== 'param') ensureParamRows().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, defs]);

  const markPending = (name: string) => {
    if (!RECOMPUTE_MASTERS.has(name)) return;
    setPending((prev) => {
      const next = [...new Set([...prev, name])];
      savePending(next);
      return next;
    });
  };

  const save = async (row: Row, isNew: boolean, masterName = cur) => {
    try {
      await api.saveMasterRow(masterName, row);
      toast.show('保存しました');
      markPending(masterName);
      if (masterName === 'vendor') await onReload?.().catch(() => {});
      if (masterName === cur) await loadRows(cur);
      else if (masterName === 'param') {
        const r = await api.getMasterRows('param');
        setParamRows(r);
      }
      await loadAudit();
      if (isNew && def && masterName === cur) setNewRow(emptyRow(def));
    } catch (e) {
      console.error(e);
      toast.show(errMsg(e, '保存に失敗しました'));
      throw e;
    }
  };

  const del = async (pkVal: unknown, masterName = cur) => {
    if (!confirm('削除しますか？')) return;
    try {
      // 日付PKは YYYY-MM-DD に揃えて送る
      const id = masterName === 'calendar' ? str(pkVal).slice(0, 10) : String(pkVal);
      await api.deleteMasterRow(masterName, id);
      toast.show('削除しました');
      markPending(masterName);
      if (masterName === cur) await loadRows(cur);
      await loadAudit();
    } catch (e) {
      console.error(e);
      toast.show(errMsg(e, '削除に失敗しました'));
      throw e;
    }
  };

  const doRecompute = async () => {
    setRecomputing(true);
    try {
      await onRecompute();
      const iso = new Date().toISOString();
      saveLastRecompute(iso);
      setLastRecompute(iso);
      savePending([]);
      setPending([]);
      await loadAudit();
    } finally {
      setRecomputing(false);
    }
  };

  const setCell = (i: number, key: string, val: unknown) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: val } : r)));

  const defaultLt = useMemo(() => {
    const row = paramRows.find((r) => str(r.key) === 'SHOP_LT_DAYS');
    return num(row?.value, 4);
  }, [paramRows]);

  const currentColors = useMemo(() => colorCounts(parts), [parts]);

  if (!def) {
    return (
      <section>
        <div className="page-head">
          <div>
            <h2>マスタ管理</h2>
          </div>
        </div>
        <p style={{ color: 'var(--muted)' }}>読み込み中…</p>
      </section>
    );
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>マスタ管理</h2>
          <p>設定は保存しただけでは一覧に出ません。「再計算して反映」で色・バッファ・マイルストン等に効きます。</p>
        </div>
        <button type="button" className="back-btn" onClick={doRecompute} disabled={recomputing}>
          {recomputing ? '再計算中…' : '🔄 再計算して反映'}
        </button>
      </div>

      {pending.length > 0 ? (
        <div className="master-banner pending">
          <div>
            <strong>未反映の変更があります</strong>
            <span>
              {pending.map(labelOf).join('・')} を編集済み → 一覧の色・バッファ等にはまだ出ていません
            </span>
          </div>
          <button type="button" className="mbtn save" onClick={doRecompute} disabled={recomputing}>
            {recomputing ? '再計算中…' : '今すぐ再計算して反映'}
          </button>
        </div>
      ) : (
        <div className="master-banner ok">
          <div>
            <strong>反映済み</strong>
            <span>最終反映: {fmtDateTime(lastRecompute)}</span>
          </div>
          <div className="param-preview-row" style={{ margin: 0 }}>
            <span className="pill green">緑 {currentColors.green}</span>
            <span className="pill yellow">黄 {currentColors.yellow}</span>
            <span className="pill red">赤 {currentColors.red}</span>
          </div>
        </div>
      )}

      <div className="toolbar master-tabs">
        {defs.map((d) => (
          <button
            key={d.name}
            type="button"
            className={`mtab ${d.name === cur ? 'active' : ''}`}
            onClick={() => navigate(routes.master(d.name))}
          >
            {d.label}
            {pending.includes(d.name) && <span className="pending-dot" title="未反映" />}
          </button>
        ))}
      </div>

      <div className="panel">
        <p className="mnote">{TAB_BLURB[cur] ?? def.note}</p>
        {cur === 'param' && (
          <ParamEditor rows={rows} parts={parts} onSave={(row) => save(row, false, 'param')} />
        )}
        {cur === 'milestone' && (
          <MilestoneEditor
            rows={rows}
            parts={parts}
            onSave={(row, isNew) => save(row, isNew)}
            onDelete={(id) => del(id)}
          />
        )}
        {cur === 'shop_lt' && (
          <ShopLtEditor
            rows={rows}
            defaultLt={defaultLt}
            onSave={(row, isNew) => save(row, isNew)}
            onDelete={(shop) => del(shop)}
          />
        )}
        {cur === 'calendar' && (
          <CalendarEditor rows={rows} onSave={(row, isNew) => save(row, isNew)} onDelete={(d) => del(d)} />
        )}
        {cur === 'vendor' && (
          <VendorEditor rows={rows} onSave={(row, isNew) => save(row, isNew)} onDelete={(p) => del(p)} />
        )}
        {cur === 'category' && (
          <CategoryEditor rows={rows} onSave={(row, isNew) => save(row, isNew)} onDelete={(id) => del(id)} />
        )}
        {!['param', 'milestone', 'shop_lt', 'calendar', 'vendor', 'category'].includes(cur) && (
          <MasterTable
            def={def}
            rows={rows}
            newRow={newRow}
            setNewRow={setNewRow}
            onChangeCell={setCell}
            onSave={(row, isNew) => save(row, isNew)}
            onDelete={(pk) => del(pk)}
          />
        )}
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 className="pt">操作履歴（監査ログ・直近）</h3>
        <div className="table-wrap">
          <table>
            <tbody>
              {audit.slice(0, 12).map((r, i) => (
                <tr key={i}>
                  <td>{String(r.at ?? '').replace('T', ' ').slice(0, 16)}</td>
                  <td>{r.app_user}</td>
                  <td>{r.action}</td>
                  <td>
                    {r.target} {r.ref}
                  </td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td style={{ padding: 12 }}>履歴なし</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
