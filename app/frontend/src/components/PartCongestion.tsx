import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as api from '../api';
import type { PartCongestionStep } from '../types';
import { routes } from '../routes';
import { barShares, COLOR_LABEL, levelLabel } from '../lib/congestion.view';
import { Loading } from './Loading';

export function PartCongestion({ osId }: { osId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['parts', osId, 'congestion'],
    queryFn: () => api.getPartCongestion(osId),
  });

  return (
    <div className="panel cong-panel">
      <div className="cong-head">
        <div>
          <h3 className="pt">後続SHOP混雑ヒートマップ</h3>
          <p className="pt-sub">これから通る工程の混み具合と、優先度の高いバッティング候補です。順番の入れ替え検討に使います。</p>
        </div>
        {data && (
          <div className="cong-legend">
            <span className="cong-legend-item lv-red">{levelLabel('red', data.thresholds)}</span>
            <span className="cong-legend-item lv-yellow">{levelLabel('yellow', data.thresholds)}</span>
            <span className="cong-legend-item lv-green">{levelLabel('green', data.thresholds)}</span>
          </div>
        )}
      </div>

      {isLoading && <Loading variant="inline" label="後続SHOPの混雑を集計中…" />}
      {error && <p className="cong-error">混雑情報の取得に失敗しました。</p>}
      {data && data.steps.length === 0 && <p className="cong-empty">残工程がないため、混雑表示の対象はありません。</p>}
      {data && data.steps.length > 0 && (
        <>
          <div className="cong-steps">
            {data.steps.map((step) => (
              <CongestionCard key={`${step.step}-${step.shop}`} step={step} />
            ))}
          </div>
          <p className="cong-note">
            ※ 着手数は、そのSHOPをまだ通る未完了部品の件数です。カードの色は件数（緑{data.thresholds.yellow}件未満／黄{data.thresholds.yellow}〜{data.thresholds.red - 1}件／赤{data.thresholds.red}件以上）です。
            バッティング候補は自分以外を緊急度・バッファ順に最大4件出しています。
          </p>
        </>
      )}
    </div>
  );
}

function CongestionCard({ step }: { step: PartCongestionStep }) {
  const navigate = useNavigate();
  const shares = barShares(step);

  return (
    <article className={`cong-card lv-${step.level}`}>
      <header className="cong-card-head">
        <div>
          <div className="cong-step">STEP {step.step}</div>
          <h4 className="cong-name">{step.name}</h4>
          <div className="cong-shop">Shop {step.shop}</div>
        </div>
        <div className="cong-started">
          <strong>{step.started.toLocaleString()}</strong>
          <span>件</span>
        </div>
      </header>

      <div className="cong-bar" aria-hidden>
        <span className="seg red" style={{ width: `${shares.red}%` }} />
        <span className="seg yellow" style={{ width: `${shares.yellow}%` }} />
        <span className="seg green" style={{ width: `${shares.green}%` }} />
      </div>

      <div className="cong-shares">
        <div className="cong-share">
          <span className="cong-share-lbl red">赤</span>
          <b>{step.red}件</b>
          <span>／ {step.redPct}%</span>
        </div>
        <div className="cong-share">
          <span className="cong-share-lbl yellow">黄</span>
          <b>{step.yellow}件</b>
          <span>／ {step.yellowPct}%</span>
        </div>
        <div className="cong-share">
          <span className="cong-share-lbl green">緑</span>
          <b>{step.green}件</b>
          <span>／ {step.greenPct}%</span>
        </div>
      </div>

      <div className="cong-pills">
        <span className="cong-pill red">赤 {step.red}件</span>
        <span className="cong-pill yellow">黄 {step.yellow}件</span>
        <span className="cong-pill green">緑 {step.green}件</span>
      </div>

      <div className="cong-batting">
        <h5>バッティング候補部品</h5>
        {step.batting.length === 0 ? (
          <p className="cong-batting-empty">他に競合する部品はありません。</p>
        ) : (
          <ul>
            {step.batting.map((p) => (
              <li key={p.id}>
                <button type="button" className="cong-batting-btn" onClick={() => navigate(routes.part(p.id))}>
                  <span className="cong-batting-text">
                    <span className="cong-batting-no">{p.partNo}</span>
                    <span className="cong-batting-name">{p.name || '（名称なし）'}</span>
                  </span>
                  <span className={`cong-prio ${p.color}`}>推奨度 {COLOR_LABEL[p.color]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {step.battingRedMore > 0 && (
          <p className="cong-batting-more">他に優先度・赤が {step.battingRedMore}件あります。</p>
        )}
      </div>
    </article>
  );
}
