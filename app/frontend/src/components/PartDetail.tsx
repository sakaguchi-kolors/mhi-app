import { useEffect, useState } from 'react';
import type { Part } from '../types';
import { jc } from '../util';
import { GaicBadges } from './GaicBadges';

export function PartDetail({
  part: p,
  stagnantThreshold = 10,
  onBack,
  onNote,
  closeLabel = '← 一覧へ戻る',
}: {
  part: Part;
  stagnantThreshold?: number;
  onBack: () => void;
  onNote: (id: string, note: string) => void;
  closeLabel?: string;
}) {
  const [note, setNote] = useState(p.note ?? '');
  // 部品切替時のみ初期化（p.note を依存に含めると refetch で入力中テキストが消える）
  // eslint-disable-next-line react-hooks/exhaustive-deps -- p.id のみ意図的
  useEffect(() => { setNote(p.note ?? ''); }, [p.id]);

  const need = p.remainShops * 4;
  const flag = p.stagnant >= stagnantThreshold;
  const currentCell = p.timeline.find((t) => t.status === 'current');
  const nextMs = p.timeline.find((t) => t.milestone && !t.mpassed);
  const msTotal = p.timeline.filter((t) => t.milestone).length;
  const msDone = p.timeline.filter((t) => t.milestone && t.mpassed).length;

  const formatMsBehind = (n: number | undefined): string => {
    if (n == null) return '—';
    if (n > 0) return `余裕 +${n}日`;
    if (n < 0) return `${Math.abs(n)}日遅れ`;
    return '期限当日';
  };

  return (
    <section>
      <div className="detail-head">
        <div className="detail-title">
          <h2 id="part-detail-title">{p.name}</h2>
          <div className="detail-meta">
            <span className="pno">{p.partNo} #{p.inst}</span>　<span className="cat-tag">{p.category}</span>{' '}
            <span className={`state-pill ${p.color}`} style={{ fontSize: 12, padding: '4px 10px' }}>{jc(p.color)} {p.buffer >= 0 ? '+' : ''}{p.buffer}日</span>
          </div>
        </div>
        <button className="back-btn" onClick={onBack}>{closeLabel}</button>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <h3 className="pt">工程タイムライン（Shop単位）</h3>
          <p className="pt-sub">完了／仕掛中／待ちと計画完了日。▲＝これから通る検査、✓＝通過済み検査。外注工程は進捗フェーズと納期情報を表示。</p>
          <div className="tl">
            {p.timeline.map((t, i) => {
              return (
                <div key={i} className={`tl-item ${t.status}`}>
                  <div className="tl-node" />
                  <div>
                    <span className="tl-name">{i + 1}. {t.name}</span>{' '}
                    {t.milestone && (t.mpassed
                      ? <span className="ms-tag passed">✓検査 通過済</span>
                      : <span className={`ms-tag ${t.mcolor ?? ''}`}>▼検査{t.mdue ? ` 期日${t.mdue}` : ''}{t.msBehind != null ? `（${formatMsBehind(t.msBehind)}）` : ''}</span>)}
                    {t.gaic && <GaicBadges t={t} />}
                    {t.gvendor && <span className="gaic-vendor">{t.gvendor}</span>}
                    <div className="tl-shop">Shop {t.shop}</div>
                  </div>
                  <div className="tl-right">
                    <span className={`badge-s ${t.status}`}>{t.status === 'done' ? '完了' : t.status === 'current' ? '仕掛中' : '待ち'}</span>
                    <div>計画 {t.plan ?? '—'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h3 className="pt">中間マイルストン（ネックジョブ）</h3>
            <p className="pt-sub">検査工程の進捗と、次の検査までの余裕日数（マイナス＝遅れ）。</p>
            <div className="calc">
              <div className="row"><span>検査通過</span><span className="val">{msDone} / {msTotal} 箇所</span></div>
              <div className="row"><span>現在の工程</span><span className="val">{currentCell ? `${currentCell.name}（Shop ${currentCell.shop}）` : p.currentShop}</span></div>
              {nextMs ? (
                <>
                  <div className="row"><span>次の検査</span><span className="val">{nextMs.name}{nextMs.mdue ? ` 期日 ${nextMs.mdue}` : ''}</span></div>
                  <div className="row"><span>次検査まで</span><span className={`val ${(nextMs.msBehind ?? 0) < 0 ? 'red' : 'green'}`}>{formatMsBehind(nextMs.msBehind)}</span></div>
                </>
              ) : (
                <div className="row"><span>次の検査</span><span className="val">すべて通過済み</span></div>
              )}
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <h3 className="pt">なぜこの状態か（判定根拠）</h3>
            <p className="pt-sub">残納期とShop所要日数の差＝バッファで色を判定。</p>
            <div className="calc">
              <div className="row"><span>最終納期（払出期日）</span><span className="val">{p.finalDue}</span></div>
              <div className="row"><span>残日数（基準日→納期）</span><span className="val">{p.daysLeft}日</span></div>
              <div className="row"><span>残Shop数 × 4日/Shop</span><span className="val">{p.remainShops} × 4 = {need}日</span></div>
              <div className="row"><span>バッファ = 残日数 − 所要</span><span className={`val ${p.buffer < 0 ? 'red' : 'green'}`}>{p.buffer >= 0 ? '+' : ''}{p.buffer}日 → {jc(p.color)}</span></div>
            </div>
            <div className={`stag-box ${flag ? 'flag' : 'ok'}`}>
              <div className="stag-num">{p.stagnant}<span style={{ fontSize: 14 }}>日</span></div>
              <div style={{ fontSize: 12 }}>現在Shop（{p.currentShop}）での滞留日数<br />
                {flag ? <b style={{ color: 'var(--red)' }}>🚩 {stagnantThreshold}日以上：レッドフラッグ</b> : `${stagnantThreshold}日未満：問題なし`}
              </div>
            </div>
            {p.urgent && (
              <div style={{ marginTop: 6 }}>
                <span className="flag urg">赤紙（緊急品）</span>
              </div>
            )}
          </div>

          <div className="panel">
            <h3 className="pt">対応メモ</h3>
            <p className="pt-sub">担当者の気づき・アクションを記録（試作）。</p>
            <textarea className="note-area" value={note}
              onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note !== (p.note ?? '')) onNote(p.id, note); }}
              placeholder="例：不働態化処理SHOPへ本日中に進捗確認。外注戻り予定を更新。" />
          </div>
        </div>
      </div>
    </section>
  );
}
