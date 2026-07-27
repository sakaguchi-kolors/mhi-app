import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Part, Meta } from './types';
import * as api from './api';
import type { Me } from './api';
import { PartsList } from './components/PartsList';
import { TroublesDashboard } from './components/TroublesDashboard';
import { PartDetail } from './components/PartDetail';
import { Masters } from './components/Masters';
import { Ingest } from './components/Ingest';
import { OwnerKishu } from './components/OwnerKishu';
import { Login, Setup } from './Auth';
import { Sidebar } from './components/Sidebar';
import { Toast, useToast } from './components/Toast';
import { PAGE_TITLES, routes, screenFromPath } from './routes';

function AdminRoute({ admin, children }: { admin: boolean; children: React.ReactNode }) {
  if (!admin) return <Navigate to={routes.parts} replace />;
  return <>{children}</>;
}

function PartDetailRoute({
  parts,
  stagnantThreshold,
  onNote,
}: {
  parts: Part[];
  stagnantThreshold: number;
  onNote: (id: string, note: string) => void;
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const part = parts.find((p) => p.id === id);
  if (!id) return <Navigate to={routes.parts} replace />;
  if (!part) {
    return (
      <div className="panel">
        部品が見つかりません（ID: {id}）
        <div style={{ marginTop: 12 }}>
          <button className="back-btn" onClick={() => navigate(routes.parts)}>← 一覧へ戻る</button>
        </div>
      </div>
    );
  }
  return <PartDetail part={part} stagnantThreshold={stagnantThreshold} onBack={() => navigate(routes.parts)} onNote={onNote} />;
}

function AppLayout({
  me,
  parts,
  meta,
  loadError,
  admin,
  reload,
  onLogout,
  onOwner,
  onTrouble,
  onShelved,
  onMemo,
  onNote,
  onRecompute,
  onAutoAssign,
  toast,
}: {
  me: Me;
  parts: Part[];
  meta: Meta | null;
  loadError: string | null;
  admin: boolean;
  reload: () => Promise<void>;
  onLogout: () => void;
  onOwner: (id: string, owner: string) => void;
  onTrouble: (id: string, flagged: boolean) => void;
  onShelved: (id: string, flagged: boolean) => void;
  onMemo: (id: string, memo: string) => void;
  onNote: (id: string, note: string) => void;
  onRecompute: () => Promise<void>;
  onAutoAssign: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const screen = screenFromPath(location.pathname);
  const asof = meta?.asOf ? meta.asOf.replace(/-/g, '/') : '';
  const detailId = location.pathname.startsWith('/parts/') ? decodeURIComponent(location.pathname.slice('/parts/'.length)) : null;
  const detailPart = detailId ? parts.find((p) => p.id === detailId) : null;
  const troubleCount = parts.filter((p) => p.trouble).length;

  const openDetail = (id: string) => {
    navigate(routes.part(id));
    window.scrollTo(0, 0);
  };

  return (
    <div className="app">
      <div className="app-shell">
        <Sidebar admin={admin} me={me} asof={asof} troubleCount={troubleCount} onLogout={onLogout} />
        <div className="app-body">
          <header className="topbar">
            <h1 className="page-title">
              {PAGE_TITLES[screen]}
              {screen === 'detail' && detailPart && <span>{detailPart.partNo}</span>}
            </h1>
            {asof && <div className="asof">データ基準日 <b>{asof}</b></div>}
          </header>
          <main className="main">
            {loadError && (
              <div className="panel" style={{ color: 'var(--red)' }}>
                APIからの取得に失敗しました：{loadError}
                <br />
                バックエンド(npm run dev)とDBが起動しているか確認してください。
              </div>
            )}

            <Routes>
              <Route path="/" element={<Navigate to={routes.parts} replace />} />
              <Route
                path={routes.parts}
                element={
                  meta ? (
                    <PartsList
                      parts={parts}
                      owners={meta.owners}
                      stagnantThreshold={meta.stagnantThreshold}
                      admin={admin}
                      defaultOwnerFilter={admin ? undefined : me.displayName}
                      onAutoAssign={onAutoAssign}
                      onOpen={openDetail}
                      onOwner={onOwner}
                      onTrouble={onTrouble}
                      onShelved={onShelved}
                      onMemo={onMemo}
                    />
                  ) : null
                }
              />
              <Route
                path={routes.troubles}
                element={
                  meta ? (
                    <TroublesDashboard
                      parts={parts}
                      owners={meta.owners}
                      defaultOwnerFilter={admin ? undefined : me.displayName}
                      onOpen={openDetail}
                      onTrouble={onTrouble}
                      onMemo={onMemo}
                    />
                  ) : null
                }
              />
              <Route path={`${routes.parts}/:id`} element={<PartDetailRoute parts={parts} stagnantThreshold={meta?.stagnantThreshold ?? 10} onNote={onNote} />} />
              <Route path={routes.ingest} element={<AdminRoute admin={admin}><Ingest toast={toast} onIngested={reload} /></AdminRoute>} />
              <Route path={routes.owners} element={<AdminRoute admin={admin}><OwnerKishu toast={toast} /></AdminRoute>} />
              <Route path={routes.masters} element={<AdminRoute admin={admin}><Navigate to={routes.master('param')} replace /></AdminRoute>} />
              <Route path={`${routes.masters}/:name`} element={<AdminRoute admin={admin}><Masters parts={parts} onRecompute={onRecompute} onReload={reload} toast={toast} /></AdminRoute>} />
              <Route path="/users" element={<Navigate to={routes.owners} replace />} />
              <Route path="*" element={<Navigate to={routes.parts} replace />} />
            </Routes>
          </main>
        </div>
      </div>
      <Toast state={toast} />
    </div>
  );
}

export function App() {
  const [parts, setParts] = useState<Part[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const admin = me?.role === '管理者';

  const reload = useCallback(async () => {
    const [m, p] = await Promise.all([api.getMeta(), api.getParts()]);
    setMeta(m);
    setParts(p);
  }, []);

  useEffect(() => {
    (async () => {
      const u = await api.authMe();
      if (u) {
        setMe(u);
        try {
          await reload();
        } catch (e) {
          setLoadError(String(e));
        }
      } else {
        try {
          const s = await api.authSetupInfo();
          setNeedsSetup(s.needsSetup);
        } catch {
          /* ignore */
        }
      }
      setBooting(false);
    })();
  }, [reload]);

  const handleAuthed = (u: Me) => {
    setMe(u);
    setNeedsSetup(false);
    setLoadError(null);
    navigate(routes.parts, { replace: true });
    reload().catch((e) => setLoadError(String(e)));
  };

  const onLogout = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    setMe(null);
    setParts([]);
    setMeta(null);
    navigate(routes.login, { replace: true });
  };

  const updatePart = (id: string, patch: Partial<Part>) =>
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

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
  const onShelved = (id: string, flagged: boolean) =>
    mutate(() => api.setShelved(id, flagged), () => updatePart(id, { shelved: flagged }));
  const onMemo = (id: string, memo: string) =>
    mutate(() => api.setMemo(id, memo), () => updatePart(id, { memo }));
  const onNote = (id: string, note: string) =>
    mutate(() => api.setNote(id, note), () => updatePart(id, { note }));

  const onRecompute = async () => {
    await api.recompute();
    await reload();
  };

  const onAutoAssign = async () => {
    const unassigned = parts.filter((p) => (p.owner ?? '未割当') === '未割当').length;
    if (unassigned === 0) {
      toast.show('未割当の部品はありません');
      return;
    }
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

  if (booting) {
    return (
      <div className="app">
        <main className="main">
          <div className="panel">読み込み中…</div>
        </main>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path={routes.login}
        element={me ? <Navigate to={routes.parts} replace /> : needsSetup ? <Navigate to={routes.setup} replace /> : <Login onDone={handleAuthed} />}
      />
      <Route
        path={routes.setup}
        element={me ? <Navigate to={routes.parts} replace /> : needsSetup ? <Setup onDone={handleAuthed} /> : <Navigate to={routes.login} replace />}
      />
      <Route
        path="/*"
        element={
          me ? (
            <AppLayout
              me={me}
              parts={parts}
              meta={meta}
              loadError={loadError}
              admin={!!admin}
              reload={reload}
              onLogout={onLogout}
              onOwner={onOwner}
              onTrouble={onTrouble}
              onShelved={onShelved}
              onMemo={onMemo}
              onNote={onNote}
              onRecompute={onRecompute}
              onAutoAssign={onAutoAssign}
              toast={toast}
            />
          ) : (
            <Navigate to={needsSetup ? routes.setup : routes.login} replace state={{ from: location.pathname }} />
          )
        }
      />
    </Routes>
  );
}
