import { useEffect, useState } from 'react';
import type { Part } from '../types';
import { jc } from '../util';

const gmap: Record<string, [string, string]> = {
  blue: ['gaic', '外注・順調/クリア'], yellow: ['gwait', '外注・要確認'], red: ['gred', '外注・払出待ち'],
};

export function PartDetail({ part: p, stagnantThreshold = 10, onBack, onNote }: { part: Part; stagnantThreshold?: number; onBack: () => void; onNote: (id: string, note: string) => void }) {
  const [note, setNote] = useState(p.note ?? '');
  // 部品切替時のみ初期化（p.note を依存に含めると refetch で入力中テキストが消える）
  // eslint-disable-next-line react-hooks/exhaustive-deps -- p.id のみ意図的
  useEffect(() => { setNote(p.note ?? ''); }, [p.id]);

  const need = p.remainShops * 4;
  const flag = p.stagnant >= stagnantThreshold;

  return (
    <section>
      <div className="detail-head">
        <div className="detail-title">
          <h2>{p.name}</h2>
          <div className="detail-meta">
            <span className="pno">{p.partNo} #{p.inst}</span>　<span className="cat-tag">{p.category}</span>{' '}
            <span className={`state-pill ${p.color}`} style={{ fontSize: 12, padding: '4px 10px' }}>{jc(p.color)} {p.buffer >= 0 ? '+' : ''}{p.buffer}日</span>
          </div>
        </div>
        <button className="back-btn" onClick={onBack}>← 一覧へ戻る</button>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <h3 className="pt">工程タイムライン（Shop単位）</h3>
          <p className="pt-sub">完了／仕掛中／待ちと計画完了日。▲＝これから通る検査、✓＝通過済み検査。</p>
          <div className="tl">
            {p.timeline.map((t, i) => {
              const g = t.gaic && t.gstat ? gmap[t.gstat] : null;
              return (
                <div key={i} className={`tl-item ${t.status}`}>
                  <div className="tl-node" />
                  <div>
                    <span className="tl-name">{i + 1}. {t.name}</span>{' '}
                    {t.milestone && (t.mpassed
                      ? <span className="ms-tag passed">✓検査 通過済</span>
                      : <span className={`ms-tag ${t.mcolor ?? ''}`}>▼検査{t.mdue ? ` 期日${t.mdue}` : ''}</span>)}
                    {g && <span className={`ms-tag ${g[0]}`}>{g[1]}{t.gvendor ? '：' + t.gvendor : ''}</span>}
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
            <div style={{ marginTop: 6 }}>
              {p.urgent && <span className="flag urg">赤紙（緊急品）</span>}
              {p.shortage && <span className="flag sho">子部品ショーテージ</span>}
            </div>
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
