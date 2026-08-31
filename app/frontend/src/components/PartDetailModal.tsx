import { useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Part } from '../types';
import { routes } from '../routes';
import { mergePartTimeline, usePartTimelines } from '../hooks/usePartTimelines';
import { PartDetail } from './PartDetail';
import { Loading } from './Loading';

export function PartDetailModal({
  part,
  stagnantThreshold,
  loading,
  missingId,
  onClose,
  onNote,
}: {
  part?: Part;
  stagnantThreshold: number;
  loading?: boolean;
  missingId?: string;
  onClose: () => void;
  onNote: (id: string, note: string) => void;
}) {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [handleClose]);

  return (
    <div className="detail-modal-bg" onClick={handleClose} role="presentation">
      <div
        className="detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="part-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && !part ? (
          <section>
            <div className="detail-head">
              <div className="detail-title">
                <h2 id="part-detail-title">部品詳細</h2>
                {missingId && <div className="detail-meta">ID: {missingId}</div>}
              </div>
              <button type="button" className="back-btn" onClick={handleClose}>閉じる</button>
            </div>
            <Loading variant="veil" label="読み込み中…" />
          </section>
        ) : part ? (
          loading ? (
            <section>
              <div className="detail-head">
                <div className="detail-title">
                  <h2 id="part-detail-title">{part.name}</h2>
                  <div className="detail-meta">
                    <span className="pno">{part.partNo} #{part.inst}</span>
                  </div>
                </div>
                <button type="button" className="back-btn" onClick={handleClose}>閉じる</button>
              </div>
              <Loading variant="veil" label="工程タイムラインを読み込み中…" />
            </section>
          ) : (
            <PartDetail
              part={part}
              stagnantThreshold={stagnantThreshold}
              onBack={handleClose}
              onNote={onNote}
              closeLabel="閉じる"
            />
          )
        ) : (
          <section>
            <div className="detail-head">
              <div className="detail-title">
                <h2 id="part-detail-title">部品が見つかりません</h2>
                {missingId && <div className="detail-meta">ID: {missingId}</div>}
              </div>
              <button type="button" className="back-btn" onClick={handleClose}>閉じる</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** /parts/:id 用。一覧は親ルートに残したままモーダルだけ差し替える */
export function PartDetailRouteModal({
  parts,
  stagnantThreshold,
  onNote,
  isLoading,
  listPath = routes.parts,
}: {
  parts: Part[];
  stagnantThreshold: number;
  onNote: (id: string, note: string) => void;
  isLoading: boolean;
  listPath?: string;
}) {
  const { id: rawId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  let id: string | undefined;
  try {
    id = rawId ? decodeURIComponent(rawId) : undefined;
  } catch {
    id = undefined;
  }
  const close = () => navigate(listPath);
  const part = id ? parts.find((p) => p.id === id) : undefined;
  const { timelines, loading: tlLoading } = usePartTimelines(id ? [id] : []);
  const partWithTimeline = part ? mergePartTimeline(part, timelines) : undefined;

  if (!id) {
    close();
    return null;
  }
  if (!partWithTimeline) {
    if (isLoading) {
      return (
        <PartDetailModal
          loading
          missingId={id}
          stagnantThreshold={stagnantThreshold}
          onClose={close}
          onNote={onNote}
        />
      );
    }
    return <PartDetailModal missingId={id} stagnantThreshold={stagnantThreshold} onClose={close} onNote={onNote} />;
  }
  return (
    <PartDetailModal
      part={partWithTimeline}
      stagnantThreshold={stagnantThreshold}
      loading={tlLoading && !timelines[id]}
      onClose={close}
      onNote={onNote}
    />
  );
}
