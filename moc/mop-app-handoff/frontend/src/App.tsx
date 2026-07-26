import { useCallback, useEffect, useState } from 'react';
import type { Part, Meta } from './types';
import * as api from './api';
import { PartsList } from './components/PartsList';
import { PartDetail } from './components/PartDetail';
import { Masters } from './components/Masters';
import { Ingest } from './components/Ingest';
import { OwnerKishu } from './components/OwnerKishu';
import { Toast, useToast } from './components/Toast';

type Screen = 'list' | 'detail' | 'masters' | 'ingest' | 'owners';

export function App() {
  const [parts, setParts] = useState<Part[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [screen, setScreen] = useState<Screen>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [admin, setAdmin] = useState<boolean>(() => localStorage.getItem('mop_admin') === '1');
  const [loadError, setLoadError] = useState<string | null>(null);
  const toast = useToast();

  const reload = useCallback(async () => {
    const [m, p] = await Promise.all([api.getMeta(), api.getParts()]);
    setMeta(m);
    setParts(p);
  }, []);

  useEffect(() => {
    reload().catch((e) => setLoadError(String(e)));
  }, [reload]);

  const toggleAdmin = (v: boolean) => {
    setAdmin(v);
    localStorage.setItem('mop_admin', v ? '1' : '0');
    if (!v && (screen === 'masters' || screen === 'ingest' || screen === 'owners')) setScreen('list');
  };

  const openDetail = (id: string) => { setSelectedId(id); setScreen('detail'); window.scrollTo(0, 0); };

  // 担当者・困りごと・メモの更新（サーバ保存後にローカル反映）
  const updatePart = (id: string, patch: Partial<Part>) =>
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // 更新系はここで例外を握り、失敗時はトースト＋サーバ状態へ再同期（UIが嘘をつかないように）
  const mutate = async (fn: () => Promise<unknown>, okPatch?: () => void) => {
    try {
      await fn();
      okPatch?.();
    } catch (e) {
      console.error(e);
      toast.show('保存に失敗しました（変更は反映されていません）');
      reload().catch(() => {});
    }
  };
  const onOwner = (id: string, owner: string) =>
    mutate(() => api.setOwner(id, owner), () => updatePart(id, { owner, ownerDays: owner === '未割当' ? null : 0 }));
  const onTrouble = (id: string, flagged: boolean) =>
    mutate(() => api.setTrouble(id, flagged), () => updatePart(id, { trouble: flagged, troubleDays: flagged ? 0 : null }));
  const onMemo = (id: string, memo: string) =>
    mutate(() => api.setMemo(id, memo), () => updatePart(id, { memo }));
  const onNote = (id: string, note: string) =>
    mutate(() => api.setNote(id, note), () => updatePart(id, { note }));

  const onRecompute = async () => {
    try {
      const r = await api.recompute();
      await reload();
      toast.show(`再計算完了：${r.parts}部品を更新`);
    } catch (e) {
      console.error(e);
      toast.show('再計算に失敗しました');
    }
  };

  const onAutoAssign = async () => {
    const unassigned = parts.filter((p) => (p.owner ?? '未割当') === '未割当').length;
    if (unassigned === 0) { toast.show('未割当の部品はありません'); return; }
    if (!confirm(`未割当 ${unassigned} 件を、機種→担当チームに基づいて自動割り当てします。\n既存の割当は変更しません。実行しますか？`)) return;
    try {
      const r = await api.autoAssign();
      await reload();
      toast.show(`自動割り当て完了：${r.assigned}件を割当${r.leftover ? `（担当不在で未割当のまま ${r.leftover}件）` : ''}`);
    } catch (e) {
      console.error(e);
      toast.show('自動割り当てに失敗しました');
    }
  };

  const selected = parts.find((p) => p.id === selectedId) ?? null;
  const asof = meta?.asOf ? meta.asOf.replace(/-/g, '/') : '';

  return (
    <div className="app">
      <main className="main">
        <div className="topbar">
          <div className="brand2"><h1>部品進捗システム <span>（仮称）</span></h1></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className={`nav-pill ${screen === 'list' || screen === 'detail' ? 'active' : ''}`} onClick={() => setScreen('list')}>部品一覧</button>
            {admin && <button className={`nav-pill ${screen === 'ingest' ? 'active' : ''}`} onClick={() => setScreen('ingest')}>データ取込</button>}
            {admin && <button className={`nav-pill ${screen === 'owners' ? 'active' : ''}`} onClick={() => setScreen('owners')}>担当者</button>}
            {admin && <button className={`nav-pill ${screen === 'masters' ? 'active' : ''}`} onClick={() => setScreen('masters')}>マスタ管理</button>}
            <label className="admin-toggle"><input type="checkbox" checked={admin} onChange={(e) => toggleAdmin(e.target.checked)} /> 管理者モード</label>
            <div className="asof">データ基準日 <b>{asof}</b></div>
          </div>
        </div>

        {loadError && (
          <div className="panel" style={{ color: 'var(--red)' }}>
            APIからの取得に失敗しました：{loadError}<br />バックエンド(npm run dev)とDBが起動しているか確認してください。
          </div>
        )}

        {screen === 'list' && meta && (
          <PartsList parts={parts} owners={meta.owners} admin={admin} onAutoAssign={onAutoAssign} onOpen={openDetail} onOwner={onOwner} onTrouble={onTrouble} onMemo={onMemo} />
        )}
        {screen === 'detail' && selected && (
          <PartDetail part={selected} onBack={() => setScreen('list')} onNote={onNote} />
        )}
        {screen === 'ingest' && admin && (
          <Ingest toast={toast} onIngested={reload} />
        )}
        {screen === 'owners' && admin && (
          <OwnerKishu toast={toast} />
        )}
        {screen === 'masters' && admin && (
          <Masters onRecompute={onRecompute} toast={toast} />
        )}
      </main>
      <Toast state={toast} />
    </div>
  );
}
