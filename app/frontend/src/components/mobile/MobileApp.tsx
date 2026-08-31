// スマホ専用シェル（/m 配下）。PC のサイドバー構成は使わず、
// 受信箱と部品詳細だけを持つ。マスタ・データ取込・担当者はここには出さない。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { routes } from '../../routes';
import { useAuth } from '../../context/AuthContext';
import { useAppData, usePartMutations } from '../../hooks/useAppData';
import { useCheckedToday } from '../../hooks/useCheckedToday';
import { mergePartTimeline, usePartTimelines } from '../../hooks/usePartTimelines';
import { describeCheckedUntil, nextWorkdayMorning } from '../../lib/mobile-checked.logic';
import { writeViewPref } from '../../lib/mobile-view';
import { Loading } from '../Loading';
import { Toast, useToast } from '../Toast';
import { ErrorBoundary } from '../ErrorBoundary';
import { MobileInbox } from './MobileInbox';
import { MobilePartDetail } from './MobilePartDetail';
import { MobileTroubleSheet } from './MobileTroubleSheet';
import { MobileMemoSheet } from './MobileMemoSheet';
import { composeTroubleMemo, findTroubleTemplate } from '../../lib/mobile-trouble-templates';
import type { Part } from '../../types';

/**
 * 誤操作の取り消し猶予（ms）。
 * 手袋・片手操作で押し直す余裕を見て長めに取る。
 */
const UNDO_MS = 12000;

type Undo = { label: string; run: () => void };
type Sheet =
  | { kind: 'trouble'; id: string }
  | { kind: 'note'; id: string };

function MobileDetailRoute({
  parts,
  stagnantThreshold,
  isLoading,
  checkedIds,
  onCheck,
  onTrouble,
  onAskTrouble,
  onAskNote,
  onMemo,
  onNote,
}: {
  parts: Part[];
  stagnantThreshold: number;
  isLoading: boolean;
  checkedIds: ReadonlySet<string>;
  onCheck: (id: string, on: boolean) => void;
  onTrouble: (id: string, on: boolean) => void;
  onAskTrouble: (part: Part) => void;
  onAskNote: (part: Part) => void;
  onMemo: (id: string, memo: string) => void;
  onNote: (id: string, note: string) => void;
}) {
  const { id: rawId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const id = useMemo(() => {
    if (!rawId) return undefined;
    try {
      return decodeURIComponent(rawId);
    } catch {
      return undefined;
    }
  }, [rawId]);
  const part = id ? parts.find((p) => p.id === id) : undefined;
  const { timelines, loading } = usePartTimelines(id ? [id] : []);
  const withTimeline = part ? mergePartTimeline(part, timelines) : undefined;
  const back = () => navigate(routes.mobile);

  if (!id) return <Navigate to={routes.mobile} replace />;
  if (!withTimeline) {
    if (isLoading) return <Loading variant="veil" />;
    return (
      <div className="m-sec">
        <p>部品が見つかりません（ID: {id}）</p>
        <button type="button" className="m-back" onClick={back}>← 受信箱</button>
      </div>
    );
  }
  if (loading && !timelines[id]) return <Loading variant="veil" label="工程を読み込み中…" />;

  return (
    <MobilePartDetail
      part={withTimeline}
      stagnantThreshold={stagnantThreshold}
      checked={checkedIds.has(id)}
      onBack={back}
      onCheck={(on) => onCheck(id, on)}
      onTrouble={(on) => onTrouble(id, on)}
      onAskTrouble={() => onAskTrouble(withTimeline)}
      onAskNote={() => onAskNote(withTimeline)}
      onMemo={(memo) => onMemo(id, memo)}
      onNote={(note) => onNote(id, note)}
    />
  );
}

export function MobileApp() {
  const { me, admin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { parts, meta, isLoading, loadError } = useAppData(!!me, me?.userId);
  const { onTrouble, onMemo, onNote } = usePartMutations(toast, me?.userId);
  const checked = useCheckedToday();
  const [undo, setUndo] = useState<Undo | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const offerUndo = useCallback((label: string, run: () => void) => {
    setUndo({ label, run });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }, []);

  const handleCheck = useCallback(
    (id: string, on: boolean) => {
      checked.set(id, on);
      if (!on) {
        setUndo(null);
        return;
      }
      const now = new Date();
      const until = describeCheckedUntil(nextWorkdayMorning(now), now);
      offerUndo(`確認済みにしました（${until}）`, () => checked.set(id, false));
    },
    [checked, offerUndo],
  );

  const handleTroubleOff = useCallback(
    (id: string) => {
      onTrouble(id, false);
      offerUndo('困りごとを解除しました', () => onTrouble(id, true));
    },
    [onTrouble, offerUndo],
  );

  const askTrouble = useCallback((part: Part) => {
    setSheet({ kind: 'trouble', id: part.id });
  }, []);

  const confirmTrouble = useCallback(
    (id: string, templateId: string, note: string) => {
      const part = parts.find((p) => p.id === id);
      const tmpl = findTroubleTemplate(templateId);
      if (!part || !tmpl) return;
      const prevMemo = part.memo;
      const prevFlag = !!part.trouble;
      onTrouble(id, true);
      onMemo(id, composeTroubleMemo(prevMemo, tmpl.label, note));
      setSheet(null);
      offerUndo('困りごとを立てました', () => {
        onTrouble(id, prevFlag);
        onMemo(id, prevMemo ?? '');
      });
    },
    [parts, onTrouble, onMemo, offerUndo],
  );

  const askNote = useCallback((part: Part) => {
    setSheet({ kind: 'note', id: part.id });
  }, []);

  const saveNote = useCallback(
    (id: string, text: string) => {
      const prev = parts.find((p) => p.id === id)?.note ?? '';
      onNote(id, text);
      setSheet(null);
      offerUndo('メモを保存しました', () => onNote(id, prev));
    },
    [parts, onNote, offerUndo],
  );

  const onLogout = async () => {
    await logout();
    navigate(routes.login, { replace: true });
  };

  if (!me) return null;

  const asof = meta?.asOf ? meta.asOf.replace(/-/g, '/') : '';
  const stagnantThreshold = meta?.stagnantThreshold ?? 10;
  // 詳細画面には下部の操作バーがあるので、「元に戻す」をその上へ逃がす
  const onDetail = location.pathname !== routes.mobile;
  const sheetPart = sheet ? parts.find((p) => p.id === sheet.id) : undefined;

  return (
    <div className={`m-app${onDetail ? ' with-actionbar' : ''}`}>
      <header className="m-topbar">
        <div className="m-topbar-main">
          <span className="m-brand">受信箱</span>
          {asof && <span className="m-asof">基準日 {asof}</span>}
        </div>
        <div className="m-topbar-sub">
          <span className="m-me">{me.displayName}</span>
          <button
            type="button"
            className="m-link"
            onClick={() => {
              writeViewPref('pc');
              navigate(routes.parts);
            }}
          >
            PC版
          </button>
          <button type="button" className="m-link" onClick={onLogout}>ログアウト</button>
        </div>
      </header>

      <main className="m-main">
        {loadError && <p className="m-error">データの取得に失敗しました：{loadError}</p>}
        <ErrorBoundary>
          <Routes>
            <Route
              path="/"
              element={
                <MobileInbox
                  parts={parts}
                  owners={meta?.owners ?? []}
                  stagnantThreshold={stagnantThreshold}
                  defaultOwner={admin ? undefined : me.displayName}
                  checkedIds={checked.ids}
                  onOpen={(id) => { navigate(routes.mobilePart(id)); window.scrollTo(0, 0); }}
                  onCheck={handleCheck}
                  onAskTrouble={askTrouble}
                />
              }
            />
            <Route
              path="parts/:id"
              element={
                <MobileDetailRoute
                  parts={parts}
                  stagnantThreshold={stagnantThreshold}
                  isLoading={isLoading}
                  checkedIds={checked.ids}
                  onCheck={handleCheck}
                  onTrouble={(id, on) => { if (!on) handleTroubleOff(id); }}
                  onAskTrouble={askTrouble}
                  onAskNote={askNote}
                  onMemo={onMemo}
                  onNote={onNote}
                />
              }
            />
            <Route path="*" element={<Navigate to={routes.mobile} replace />} />
          </Routes>
        </ErrorBoundary>
        {isLoading && <Loading variant="veil" />}
      </main>

      {undo && (
        <div className="m-undo" role="status">
          <span>{undo.label}</span>
          <button
            type="button"
            onClick={() => {
              undo.run();
              setUndo(null);
            }}
          >
            元に戻す
          </button>
        </div>
      )}
      {sheet?.kind === 'trouble' && sheetPart && (
        <MobileTroubleSheet
          partName={`${sheetPart.name}（${sheetPart.partNo}）`}
          onClose={() => setSheet(null)}
          onConfirm={(templateId, note) => confirmTrouble(sheetPart.id, templateId, note)}
        />
      )}
      {sheet?.kind === 'note' && sheetPart && (
        <MobileMemoSheet
          title="メモ"
          partName={`${sheetPart.name}（${sheetPart.partNo}）`}
          initial={sheetPart.note ?? ''}
          placeholder="例：本日中に後工程へ進捗確認。"
          onClose={() => setSheet(null)}
          onSave={(text) => saveNote(sheetPart.id, text)}
        />
      )}
      <Toast state={toast} />
    </div>
  );
}
