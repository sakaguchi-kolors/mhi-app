import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMemo } from 'react';
import type { Part, Meta } from './types';
import type { Me, RecomputeResult } from './api';
import { PartsList } from './components/PartsList';
import { TroublesDashboard } from './components/TroublesDashboard';
import { PartDetail } from './components/PartDetail';
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

function AdminRoute({ admin, children }: { admin: boolean; children: React.ReactNode }) {
  if (!admin) return <Navigate to={routes.parts} replace />;
  return <>{children}</>;
}

function PartDetailRoute({
  parts,
  stagnantThreshold,
  onNote,
  isLoading,
}: {
  parts: Part[];
  stagnantThreshold: number;
  onNote: (id: string, note: string) => void;
  isLoading: boolean;
}) {
  const { id: rawId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  let id: string | undefined;
  try {
    id = rawId ? decodeURIComponent(rawId) : undefined;
  } catch {
    return <Navigate to={routes.parts} replace />;
  }
  const part = id ? parts.find((p) => p.id === id) : undefined;
  if (!id) return <Navigate to={routes.parts} replace />;
  if (!part) {
    if (isLoading) return null;
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
  isLoading,
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
  isLoading: boolean;
  loadError: string | null;
  admin: boolean;
  reload: () => Promise<void>;
  onLogout: () => void;
  onOwner: (id: string, owner: string) => void;
  onTrouble: (id: string, flagged: boolean) => void;
  onShelved: (id: string, flagged: boolean) => void;
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
    if (!location.pathname.startsWith(`${routes.parts}/`)) return null;
    const raw = location.pathname.slice(`${routes.parts}/`.length);
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }, [location.pathname]);
  const detailPart = detailId ? parts.find((p) => p.id === detailId) : null;
  const troubleCount = useMemo(() => parts.filter((p) => p.trouble).length, [parts]);
  const needsPartsData = screen === 'parts' || screen === 'detail' || screen === 'troubles';
  const showPartsVeil = needsPartsData && isLoading;

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
                          defaultOwnerFilter={admin ? undefined : me.displayName}
                          onOpen={openDetail}
                          onTrouble={onTrouble}
                          onMemo={onMemo}
                        />
                      ) : null
                    }
                  />
                  <Route
                    path={`${routes.parts}/:id`}
                    element={
                      <PartDetailRoute
                        parts={parts}
                        stagnantThreshold={meta?.stagnantThreshold ?? 10}
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
  const { parts, meta, isLoading, loadError, reload } = useAppData(!!me);
  const { onOwner, onTrouble, onShelved, onMemo, onNote, runRecompute, autoAssign } = usePartMutations(toast);

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
