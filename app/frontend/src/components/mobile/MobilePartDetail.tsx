// スマホ部品詳細。工程を縦カードで積み、その下に判定根拠・困りごと・メモを置く。
// 操作（確認済み／困りごと／メモ）は親指の届く下端に固定する。
import { useEffect, useRef, useState } from 'react';
import type { Part } from '../../types';
import { gaicPhaseLabel, jc } from '../../util';

const STATUS_LABEL = { done: '完了', current: '仕掛中', wait: '待ち' } as const;

export function MobilePartDetail({
  part: p,
  stagnantThreshold,
  checked,
  onBack,
  onCheck,
  onTrouble,
  onMemo,
  onNote,
}: {
  part: Part;
  stagnantThreshold: number;
  checked: boolean;
  onBack: () => void;
  onCheck: (on: boolean) => void;
  onTrouble: (on: boolean) => void;
  onMemo: (memo: string) => void;
  onNote: (note: string) => void;
}) {
  const [memo, setMemo] = useState(p.memo ?? '');
  const [note, setNote] = useState(p.note ?? '');
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMemo(p.memo ?? '');
    setNote(p.note ?? '');
    // 部品を切り替えたときだけ初期化（再取得で入力中のテキストを消さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps -- p.id のみ意図的
  }, [p.id]);

  // 所要日数は Shop 別LTの合計なので、算出済みの値から逆算する（PC詳細と同じ根拠）
  const need = p.daysLeft - p.buffer;
  const stagFlag = p.stagnant >= stagnantThreshold;

  return (
    <div className="m-detail">
      <div className={`m-detail-head ${p.color}`}>
        <button type="button" className="m-back" onClick={onBack}>← 受信箱</button>
        <div className="m-detail-title">{p.name}</div>
        <div className="m-detail-sub">
          {p.partNo} <span>#{p.inst}</span>／{p.kishu || '機種未設定'}
        </div>
        <div className="m-detail-pills">
          <span className={`m-sev ${p.color}`}>{jc(p.color)} {p.buffer >= 0 ? '+' : ''}{p.buffer}日</span>
          <span className="m-days">残{p.daysLeft}日</span>
          <span className={`m-stag${stagFlag ? ' flag' : ''}`}>{stagFlag && '🚩'}滞留{p.stagnant}日</span>
        </div>
      </div>

      <section className="m-sec">
        <h2 className="m-sec-t">工程</h2>
        <p className="m-sec-s">上から順に進みます。▼＝これから通る検査、✓＝通過済み。</p>
        <ol className="m-steps">
          {p.timeline.map((t, i) => (
            <li key={`${t.shop}-${i}`} className={`m-step ${t.status}`}>
              <div className="m-step-head">
                <span className="m-step-no">{i + 1}</span>
                <span className="m-step-name">{t.name}</span>
                <span className={`m-step-badge ${t.status}`}>{STATUS_LABEL[t.status]}</span>
              </div>
              <div className="m-step-meta">
                <span>Shop {t.shop}</span>
                <span>計画 {t.plan ?? '—'}</span>
              </div>
              {(t.milestone || t.gaic) && (
                <div className="m-step-tags">
                  {t.milestone && (
                    <span className={`m-tag ms ${t.mpassed ? 'passed' : (t.mcolor ?? '')}`}>
                      {t.mpassed ? '✓検査 通過済' : `▼検査${t.mdue ? ` 期日${t.mdue}` : ''}`}
                    </span>
                  )}
                  {t.gaic && (
                    <span className="m-tag gaic">
                      外注{t.gphase ? `／${gaicPhaseLabel[t.gphase]}` : ''}{t.gvendor ? `／${t.gvendor}` : ''}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="m-sec">
        <h2 className="m-sec-t">なぜこの色か（判定根拠）</h2>
        <dl className="m-calc">
          <div><dt>最終納期</dt><dd>{p.finalDue}</dd></div>
          <div><dt>残日数（基準日→納期）</dt><dd>{p.daysLeft}日</dd></div>
          <div><dt>残り工程の所要</dt><dd>残{p.remainShops}Shop = {need}日</dd></div>
          <div className="sum">
            <dt>バッファ＝残日数−所要</dt>
            <dd className={p.buffer < 0 ? 'red' : 'green'}>
              {p.buffer >= 0 ? '+' : ''}{p.buffer}日 → {jc(p.color)}
            </dd>
          </div>
        </dl>
        <p className={`m-stag-note${stagFlag ? ' flag' : ''}`}>
          現工程（{p.currentShop || '—'}）での滞留 {p.stagnant}日：
          {stagFlag ? `${stagnantThreshold}日以上のため要確認` : `${stagnantThreshold}日未満`}
        </p>
        {(p.urgent || p.shortage) && (
          <div className="m-flags">
            {p.urgent && <span className="m-tag urg">赤紙（緊急品）</span>}
            {p.shortage && <span className="m-tag sho">子部品ショーテージ</span>}
          </div>
        )}
      </section>

      <section className="m-sec">
        <h2 className="m-sec-t">困りごと</h2>
        <label className="m-switch">
          <input type="checkbox" checked={!!p.trouble} onChange={(e) => onTrouble(e.target.checked)} />
          <span>{p.trouble ? '困りごとあり' : '困りごとなし'}</span>
        </label>
        <textarea
          className="m-area"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() => { if (memo !== (p.memo ?? '')) onMemo(memo); }}
          placeholder="例：材料未入荷。前工程の戻り待ち。"
          rows={3}
        />
      </section>

      <section className="m-sec">
        <h2 className="m-sec-t">メモ</h2>
        <textarea
          ref={noteRef}
          className="m-area"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note !== (p.note ?? '')) onNote(note); }}
          placeholder="例：本日中に後工程へ進捗確認。"
          rows={3}
        />
      </section>

      <div className="m-actionbar">
        <button type="button" className={`m-abtn ok${checked ? ' on' : ''}`} onClick={() => onCheck(!checked)}>
          {checked ? '確認を取消' : '今日は確認した'}
        </button>
        <button type="button" className={`m-abtn tr${p.trouble ? ' on' : ''}`} onClick={() => onTrouble(!p.trouble)}>
          困りごと
        </button>
        <button
          type="button"
          className="m-abtn memo"
          onClick={() => {
            noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            noteRef.current?.focus();
          }}
        >
          メモ
        </button>
      </div>
    </div>
  );
}
