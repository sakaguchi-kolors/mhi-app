import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MasterDef, Part } from '../types';
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
import { AuditSearch, MASTER_HISTORY_TAB } from './masters/AuditSearch';
import {
  type Row,
  RECOMPUTE_MASTERS,
  colorCounts,
  fmtDateTime,
  loadLastRecompute,
  num,
  saveLastRecompute,
  str,
} from './masters/shared';

function emptyRow(def: MasterDef): Row {
  const r: Row = {};
  for (const c of def.columns) r[c.key] = c.type === 'bool' ? true : '';
  return r;
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message && !e.message.startsWith('API ')) return e.message;
  return fallback;
}

function isValidMasterTab(name: string, defs: MasterDef[]): boolean {
  return name === MASTER_HISTORY_TAB || defs.some((d) => d.name === name);
}

const TAB_BLURB: Record<string, string> = {
  param: '緊急度の色・所要日数・納期の採用元など、算出の係数を設定します。保存すると一覧に自動反映されます。',
  milestone: 'タイムライン上で検査マイルストンとみなす工程の条件です。保存するとタイムラインに自動反映されます。',
  shop_lt: 'Shopごとの所要日数の例外設定です。未登録は既定LTを使います。保存するとバッファ等に自動反映されます。',
  calendar: '休日を登録すると、残日数計算からその日を除外します。保存すると残日数・バッファに自動反映されます。',
  vendor: '注文番号から外注先名を表示するための対応表です。保存するとタイムライン表示にすぐ反映されます。',
  category: '部品番号から完成品分類を決めるルールです。保存すると一覧の分類に自動反映されます。',
  [MASTER_HISTORY_TAB]: 'マスタの変更履歴を期間・種別で検索し、CSV出力できます。',
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
  const [applying, setApplying] = useState(false);
  const [lastApplied, setLastApplied] = useState<string | null>(() => loadLastRecompute());
  const [paramRows, setParamRows] = useState<Row[]>([]);

  const cur = routeName ?? '';
  const isHistory = cur === MASTER_HISTORY_TAB;
  const def = useMemo(() => defs.find((d) => d.name === cur), [defs, cur]);

  useEffect(() => {
    api
      .getMasters()
      .then((d) => {
        setDefs(d);
        if (!routeName || !isValidMasterTab(routeName, d)) {
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
    if (!isValidMasterTab(routeName, defs)) {
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
  const ensureParamRows = async () => {
    if (paramRows.length) return paramRows;
    const r = await api.getMasterRows('param');
    setParamRows(r);
    return r;
  };

  useEffect(() => {
    if (!cur || !isValidMasterTab(cur, defs)) return;
    if (isHistory) return;
    setRows([]);
    loadRows(cur).catch((e) => {
      console.error(e);
      toast.show(errMsg(e, 'マスタの取得に失敗しました'));
    });
    if (cur !== 'param') ensureParamRows().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, defs]);

  const applyAfterChange = async (masterName: string, action: 'save' | 'delete') => {
    if (RECOMPUTE_MASTERS.has(masterName)) {
      setApplying(true);
      try {
        await onRecompute();
        const iso = new Date().toISOString();
        saveLastRecompute(iso);
        setLastApplied(iso);
        toast.show(action === 'save' ? '保存して反映しました' : '削除して反映しました');
      } catch (e) {
        console.error(e);
        toast.show(errMsg(e, '一覧への反映に失敗しました'));
      } finally {
        setApplying(false);
      }
      return;
    }
    if (masterName === 'vendor') {
      await onReload?.().catch(() => {});
    }
    toast.show(action === 'save' ? '保存しました' : '削除しました');
  };

  const save = async (row: Row, isNew: boolean, masterName = cur) => {
    if (masterName === 'milestone' && !str(row.pattern).trim()) {
      toast.show('パターンを入力してください');
      return;
    }
    try {
      await api.saveMasterRow(masterName, row);
      if (masterName === cur) await loadRows(cur);
      else if (masterName === 'param') {
        const r = await api.getMasterRows('param');
        setParamRows(r);
      }
      if (isNew && def && masterName === cur) setNewRow(emptyRow(def));
      await applyAfterChange(masterName, 'save');
    } catch (e) {
      console.error(e);
      toast.show(errMsg(e, '保存に失敗しました'));
      throw e;
    }
  };

  const del = async (pkVal: unknown, masterName = cur) => {
    if (pkVal == null || pkVal === '' || String(pkVal) === 'undefined') {
      toast.show('削除対象を特定できません。画面を再読み込みしてください。');
      return;
    }
    if (!confirm('削除しますか？')) return;
    try {
      const id = masterName === 'calendar' ? str(pkVal).slice(0, 10) : String(pkVal);
      await api.deleteMasterRow(masterName, id);
      if (masterName === cur) await loadRows(cur);
      await applyAfterChange(masterName, 'delete');
    } catch (e) {
      console.error(e);
      toast.show(errMsg(e, '削除に失敗しました'));
      throw e;
    }
  };

  const setCell = (i: number, key: string, val: unknown) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: val } : r)));

  const defaultLt = useMemo(() => {
    const row = paramRows.find((r) => str(r.key) === 'SHOP_LT_DAYS');
    return num(row?.value, 4);
  }, [paramRows]);

  const currentColors = useMemo(() => colorCounts(parts), [parts]);

  if (!defs.length || (!isHistory && !def)) {
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
          <p>マスタを保存すると、算出結果（色・バッファ・分類など）に自動反映されます。</p>
        </div>
      </div>

      <div className={`master-banner ${applying ? 'pending' : 'ok'}`}>
        <div>
          <strong>{applying ? '一覧へ反映中…' : '自動反映'}</strong>
          <span>
            {applying
              ? '部品一覧を更新しています'
              : `最終反映: ${fmtDateTime(lastApplied)}`}
          </span>
        </div>
        {!applying && (
          <div className="param-preview-row" style={{ margin: 0 }}>
            <span className="pill green">緑 {currentColors.green}</span>
            <span className="pill yellow">黄 {currentColors.yellow}</span>
            <span className="pill red">赤 {currentColors.red}</span>
          </div>
        )}
      </div>

      <div className="toolbar master-tabs">
        {defs.map((d) => (
          <button
            key={d.name}
            type="button"
            className={`mtab ${d.name === cur ? 'active' : ''}`}
            onClick={() => navigate(routes.master(d.name))}
            disabled={applying}
          >
            {d.label}
          </button>
        ))}
        <button
          type="button"
          className={`mtab ${isHistory ? 'active' : ''}`}
          onClick={() => navigate(routes.master(MASTER_HISTORY_TAB))}
          disabled={applying}
        >
          変更履歴
        </button>
      </div>

      <div className="panel">
        <p className="mnote">{TAB_BLURB[cur] ?? def?.note}</p>
        {isHistory && <AuditSearch defs={defs} toast={toast} />}
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
            parts={parts}
            defaultLt={defaultLt}
            onSave={(row, isNew) => save(row, isNew)}
            onDelete={(shop) => del(shop)}
          />
        )}
        {cur === 'calendar' && (
          <CalendarEditor
            rows={rows}
            parts={parts}
            onSave={(row, isNew) => save(row, isNew)}
            onDelete={(d) => del(d)}
          />
        )}
        {cur === 'vendor' && (
          <VendorEditor rows={rows} onSave={(row, isNew) => save(row, isNew)} onDelete={(p) => del(p)} />
        )}
        {cur === 'category' && (
          <CategoryEditor
            rows={rows}
            parts={parts}
            onSave={(row, isNew) => save(row, isNew)}
            onDelete={(id) => del(id)}
          />
        )}
        {!isHistory &&
          !['param', 'milestone', 'shop_lt', 'calendar', 'vendor', 'category'].includes(cur) &&
          def && (
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
    </section>
  );
}
