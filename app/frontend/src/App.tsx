import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import type { Part, Meta } from './types';
import type { Me, RecomputeResult } from './api';
import { PartsList } from './components/PartsList';
import { TroublesDashboard } from './components/TroublesDashboard';
import { WatchDashboard } from './components/WatchDashboard';
import { PartDetailRouteModal } from './components/PartDetailModal';
import { Masters } from './components/Masters';
import { Ingest } from './components/Ingest';
import { OwnerKishu } from './components/OwnerKishu';
import { Login, Setup } from './Auth';
import { Sidebar } from './components/Sidebar';
import { Toast, useToast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PAGE_TITLES, routes, screenFromPath } from './routes';
import { Loading } from './components/Loading';
import { useAuth } from './context/AuthContext';
import { useAppData, usePartMutations } from './hooks/useAppData';
import { clearAppQueryCache, notifyAuthChange } from './lib/queryClient';

function AdminRoute({ admin, children }: { admin: boolean; children: React.ReactNode }) {
  if (!admin) return <Navigate to={routes.parts} replace />;
  return <>{children}</>;
}

function PartsSection({
  parts,
  meta,
  admin,
  me,
  onAutoAssign,
  onOpen,
  onOwner,
  onTrouble,
  onShelved,
  onWatch,
  onMemo,
}: {
  parts: Part[];
  meta: Meta | null;
  admin: boolean;
  me: Me;
  onAutoAssign?: () => void;
  onOpen: (id: string) => void;
  onOwner: (id: string, owner: string) => void;
  onTrouble: (id: string, flagged: boolean) => void;
  onShelved: (id: string, flagged: boolean) => void;
  onWatch: (id: string, flagged: boolean) => void;
  onMemo: (id: string, memo: string) => void;
}) {
  const myKishus = me.kishus ?? [];
  return (
    <>
      <PartsList
        parts={parts}
        owners={meta?.owners ?? []}
        stagnantThreshold={meta?.stagnantThreshold ?? 10}
        admin={admin}
        meDisplayName={me.displayName}
        myKishus={myKishus}
        defaultOwnerFilter={admin ? undefined : me.displayName}
        onAutoAssign={onAutoAssign}
        onOpen={onOpen}
        onOwner={onOwner}
        onTrouble={onTrouble}
        onShelved={onShelved}
        onWatch={onWatch}
        onMemo={onMemo}
      />
      <Outlet />
    </>
  );
}

function WatchSection({
  parts,
  meta,
  admin,
  me,
  onOpen,
  onOwner,
  onTrouble,
  onShelved,
  onWatch,
  onMemo,
}: {
  parts: Part[];
  meta: Meta | null;
  admin: boolean;
  me: Me;
  onOpen: (id: string) => void;
  onOwner: (id: string, owner: string) => void;
  onTrouble: (id: string, flagged: boolean) => void;
  onShelved: (id: string, flagged: boolean) => void;
  onWatch: (id: string, flagged: boolean) => void;
  onMemo: (id: string, memo: string) => void;
}) {
  const myKishus = me.kishus ?? [];
  return (
    <>
      <WatchDashboard
        parts={parts}
        owners={meta?.owners ?? []}
        stagnantThreshold={meta?.stagnantThreshold ?? 10}
        admin={admin}
        meDisplayName={me.displayName}
        myKishus={myKishus}
        defaultOwnerFilter={admin ? undefined : me.displayName}
        onOpen={onOpen}
        onOwner={onOwner}
        onTrouble={onTrouble}
        onShelved={onShelved}
        onWatch={onWatch}
        onMemo={onMemo}
      />
      <Outlet />
    </>
  );
}

function AppLayout({
  me,
  parts,
  meta,
  isLoading,
  loadError,
  admin,
  reload,
  onLogout,
  onOwner,
  onTrouble,
  onShelved,
  onWatch,
  onMemo,
  onNote,
  onRecompute,
  onAutoAssign,
  toast,
}: {
  me: Me;
  parts: Part[];
  meta: Meta | null;
  isLoading: boolean;
  loadError: string | null;
  admin: boolean;
  reload: () => Promise<void>;
  onLogout: () => void;
  onOwner: (id: string, owner: string) => void;
  onTrouble: (id: string, flagged: boolean) => void;
  onShelved: (id: string, flagged: boolean) => void;
  onWatch: (id: string, flagged: boolean) => void;
  onMemo: (id: string, memo: string) => void;
  onNote: (id: string, note: string) => void;
  onRecompute: (opts?: { background?: boolean }) => Promise<RecomputeResult>;
  onAutoAssign: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const screen = screenFromPath(location.pathname);
  const asof = meta?.asOf ? meta.asOf.replace(/-/g, '/') : '';
  const detailId = useMemo(() => {
    for (const base of [routes.parts, routes.watch] as const) {
      if (!location.pathname.startsWith(`${base}/`)) continue;
      const raw = location.pathname.slice(`${base}/`.length);
      if (!raw) return null;
      try {
        return decodeURIComponent(raw);
      } catch {
        return null;
      }
    }
    return null;
  }, [location.pathname]);
  const detailPart = detailId ? parts.find((p) => p.id === detailId) : null;
  const troubleCount = useMemo(() => parts.filter((p) => p.trouble).length, [parts]);
  const watchCount = useMemo(() => parts.filter((p) => p.watch).length, [parts]);
  const needsPartsData = screen === 'parts' || screen === 'detail' || screen === 'troubles' || screen === 'watch';
  const showPartsVeil = needsPartsData && isLoading;

  const openDetail = (id: string) => {
    const base = screen === 'watch' ? routes.watch : routes.parts;
    navigate(`${base}/${encodeURIComponent(id)}`);
  };

  return (
    <div className="app">
      <div className="app-shell">
        <Sidebar admin={admin} me={me} asof={asof} troubleCount={troubleCount} watchCount={watchCount} onLogout={onLogout} />
        <div className="app-body">
          <header className="topbar">
            <h1 className="page-title">
              {PAGE_TITLES[screen]}
              {detailId && detailPart && <span>{detailPart.partNo}</span>}
            </h1>
            {asof && <div className="asof">データ基準日 <b>{asof}</b></div>}
          </header>
          <main className="main">
            {loadError && (
              <div className="panel" style={{ color: 'var(--red)', marginBottom: 12 }}>
                APIからの取得に失敗しました：{loadError}
                <br />
                バックエンド(npm run dev)とDBが起動しているか確認してください。
              </div>
            )}

            <div className="main-inner">
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Navigate to={routes.parts} replace />} />
                  <Route
                    path={routes.parts}
                    element={
                      <PartsSection
                        parts={parts}
                        meta={meta}
                        admin={admin}
                        me={me}
                        onAutoAssign={onAutoAssign}
                        onOpen={openDetail}
                        onOwner={onOwner}
                        onTrouble={onTrouble}
                        onShelved={onShelved}
                        onWatch={onWatch}
                        onMemo={onMemo}
                      />
                    }
                  >
                    <Route
                      path=":id"
                      element={
                        <PartDetailRouteModal
                          parts={parts}
                          stagnantThreshold={meta?.stagnantThreshold ?? 10}
                          onNote={onNote}
                          isLoading={isLoading}
                          listPath={routes.parts}
                        />
                      }
                    />
                  </Route>
                  <Route
                    path={routes.watch}
                    element={
                      <WatchSection
                        parts={parts}
                        meta={meta}
                        admin={admin}
                        me={me}
                        onOpen={openDetail}
                        onOwner={onOwner}
                        onTrouble={onTrouble}
                        onShelved={onShelved}
                        onWatch={onWatch}
                        onMemo={onMemo}
                      />
                    }
                  >
                    <Route
                      path=":id"
                      element={
                        <PartDetailRouteModal
                          parts={parts}
                          stagnantThreshold={meta?.stagnantThreshold ?? 10}
                          onNote={onNote}
                          isLoading={isLoading}
                          listPath={routes.watch}
                        />
                      }
                    />
                  </Route>
                  <Route
                    path={routes.troubles}
                    element={
                      <TroublesDashboard
                        parts={parts}
                        stagnantThreshold={meta?.stagnantThreshold ?? 10}
                        defaultOwnerFilter={admin ? undefined : me.displayName}
                        onTrouble={onTrouble}
                        onMemo={onMemo}
                        onNote={onNote}
                        isLoading={isLoading}
                      />
                    }
                  />
                  <Route path={routes.ingest} element={<AdminRoute admin={admin}><Ingest toast={toast} onIngested={reload} /></AdminRoute>} />
                  <Route path={routes.owners} element={<AdminRoute admin={admin}><OwnerKishu toast={toast} /></AdminRoute>} />
                  <Route path={routes.masters} element={<AdminRoute admin={admin}><Navigate to={routes.master('param')} replace /></AdminRoute>} />
                  <Route path={`${routes.masters}/:name`} element={<AdminRoute admin={admin}><Masters parts={parts} onRecompute={onRecompute} onReload={reload} toast={toast} /></AdminRoute>} />
                  <Route path="/users" element={<Navigate to={routes.owners} replace />} />
                  <Route path="*" element={<Navigate to={routes.parts} replace />} />
                </Routes>
              </ErrorBoundary>
              {showPartsVeil && <Loading variant="veil" />}
            </div>
          </main>
        </div>
      </div>
      <Toast state={toast} />
    </div>
  );
}

function AuthenticatedApp() {
  const { me, admin, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { parts, meta, isLoading, loadError, reload } = useAppData(!!me, me?.userId);
  const { onOwner, onTrouble, onShelved, onWatch, onMemo, onNote, runRecompute, autoAssign } = usePartMutations(toast, me?.userId);

  const onLogout = async () => {
    await logout();
    navigate(routes.login, { replace: true });
  };

  const onRecompute = (opts?: { background?: boolean }) => runRecompute(opts);

  const onAutoAssign = () => {
    const unassigned = parts.filter((p) => (p.owner ?? '未割当') === '未割当').length;
    if (unassigned === 0) {
      toast.show('未割当の部品はありません');
      return;
    }
    if (!confirm(`未割当 ${unassigned} 件を、機種→担当チームに基づいて自動割り当てします。\n既存の割当は変更しません。実行しますか？`)) return;
    autoAssign.mutate(undefined, {
      onSuccess: (r) => {
        toast.show(`自動割り当て完了：${r.assigned}件を割当${r.leftover ? `（担当不在で未割当のまま ${r.leftover}件）` : ''}`);
      },
      onError: (e) => {
        console.error(e);
        toast.show('自動割り当てに失敗しました');
      },
    });
  };

  if (!me) return null;

  return (
    <AppLayout
      me={me}
      parts={parts}
      meta={meta}
      isLoading={isLoading}
      loadError={loadError}
      admin={admin}
      reload={reload}
      onLogout={onLogout}
      onOwner={onOwner}
      onTrouble={onTrouble}
      onShelved={onShelved}
      onWatch={onWatch}
      onMemo={onMemo}
      onNote={onNote}
      onRecompute={onRecompute}
      onAutoAssign={onAutoAssign}
      toast={toast}
    />
  );
}

export function App() {
  const { me, booting, bootError, needsSetup, setMe, setNeedsSetup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleAuthed = (u: Me) => {
    clearAppQueryCache();
    notifyAuthChange();
    setMe(u);
    setNeedsSetup(false);
    navigate(routes.parts, { replace: true });
  };

  if (booting) {
    return (
      <div className="app">
        <main className="main main-inner">
          {bootError ? (
            <div className="panel" style={{ color: 'var(--red)' }}>
              サーバーへの接続に失敗しました：{bootError}
              <br />
              バックエンド(npm run dev)とDBが起動しているか確認してください。
            </div>
          ) : (
            <Loading variant="veil" label="認証情報を確認中…" />
          )}
        </main>
      </div>
    );
  }

  return (
    <ErrorBoundary>
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
            <AuthenticatedApp />
          ) : (
            <Navigate to={needsSetup ? routes.setup : routes.login} replace state={{ from: location.pathname }} />
          )
        }
      />
      </Routes>
    </ErrorBoundary>
  );
}
