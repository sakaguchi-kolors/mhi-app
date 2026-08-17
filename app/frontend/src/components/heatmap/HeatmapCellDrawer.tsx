import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../../api';
import type { HeatCellParams } from '../../api';
import type { HeatUnit } from '../../types';
import { jc } from '../../util';
import { bucketLabel } from '../../lib/heatmap.view';
import { Loading } from '../Loading';
import type { SelectedCell } from './HeatmapGrid';

interface Props {
  selected: SelectedCell;
  params: HeatCellParams;
  unit: HeatUnit;
  onClose: () => void;
  onOpenPart: (id: string) => void;
}

export function HeatmapCellDrawer({ selected, params, unit, onClose, onOpenPart }: Props) {
  const { row, bucket } = selected;
  const { data, isLoading, error } = useQuery({
    queryKey: ['heatmap', 'cell', params],
    queryFn: () => api.getHeatmapCell(params),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parts = data?.parts ?? [];
  const hidden = (data?.total ?? 0) - parts.length;

  return (
    <>
      <div className="heat-drawer-veil" onClick={onClose} />
      <aside className="heat-drawer" aria-label="セルの内訳">
        <div className="heat-drawer-head">
          <div>
            <h3>
              {row.name} <span className="heat-shop-code">{row.shop}{row.job ? ` / ${row.job}` : ''}</span>
            </h3>
            <p className="pt-sub">
              {bucketLabel(bucket, unit)}（{bucket.from} 〜 {bucket.to}）／ バッファが小さい順
            </p>
          </div>
          <button type="button" className="back-btn" onClick={onClose}>
            閉じる ✕
          </button>
        </div>

        <div className="heat-drawer-body">
          {isLoading && <Loading label="内訳を読み込み中…" />}
          {error && <div className="heat-empty">内訳の取得に失敗しました：{String(error)}</div>}
          {!isLoading && !error && parts.length === 0 && <div className="heat-empty">該当する部品がありません。</div>}

          {parts.map((p) => (
            <button key={p.id} type="button" className="heat-part" onClick={() => onOpenPart(p.id)}>
              <div className="heat-part-top">
                <span className={`state-pill ${p.color}`}>
                  {jc(p.color)}　{p.buffer >= 0 ? '+' : ''}
                  {p.buffer}日
                </span>
                <span className="heat-part-due">残{p.daysLeft}日</span>
                <span className="heat-part-kishu">{p.kishu || '—'}</span>
              </div>
              <div className="heat-part-name">{p.name || '（名称なし）'}</div>
              <div className="heat-part-meta">
                <span>
                  {p.partNo} #{p.inst}
                </span>
                {p.planStart && <span className="heat-part-plan">着手 {p.planStart}</span>}
                {p.planEnd && <span className="heat-part-plan">完了 {p.planEnd}</span>}
              </div>
              <div className="heat-part-flags">
                <span className="heat-part-owner">{p.owner}</span>
                {p.urgent && <span className="flag urg">赤紙</span>}
                {p.shortage && <span className="flag sho">子部品欠品</span>}
                {p.trouble && <span className="flag stag">困りごと</span>}
              </div>
            </button>
          ))}

          {hidden > 0 && <div className="heat-empty">ほか {hidden} 件は絞り込んでご確認ください。</div>}
        </div>
      </aside>
    </>
  );
}
