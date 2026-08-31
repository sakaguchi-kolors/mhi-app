// 受信箱の1件。メールアプリの一覧行に相当し、タップで詳細に入る。
// 右スワイプ＝今日は確認した、左スワイプ＝困りごと。ボタンも残す。
import type { Part } from '../../types';
import { jc } from '../../util';
import { isStagnant } from '../../lib/mobile-inbox.logic';
import { useCardSwipe } from './useCardSwipe';

export function MobilePartCard({
  part: p,
  stagnantThreshold,
  checked,
  onOpen,
  onCheck,
  onTrouble,
}: {
  part: Part;
  stagnantThreshold: number;
  checked: boolean;
  onOpen: () => void;
  onCheck: (on: boolean) => void;
  onTrouble: () => void;
}) {
  const stag = isStagnant(p, stagnantThreshold);
  const swipe = useCardSwipe({
    onCheck: () => { if (!checked) onCheck(true); },
    onTrouble,
  });

  return (
    <div className="m-swipe-wrap">
      <div className={`m-swipe-bg${swipe.dx > 8 ? ' show-ok' : ''}${swipe.dx < -8 ? ' show-tr' : ''}`} aria-hidden>
        <span className="m-swipe-hint ok">今日は確認した</span>
        <span className="m-swipe-hint tr">困りごと</span>
      </div>
      <article
        className={`m-card ${p.color}${checked ? ' checked' : ''}`}
        style={{
          transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined,
          willChange: swipe.dx ? 'transform' : undefined,
        }}
        onPointerDown={swipe.onPointerDown}
        onPointerMove={swipe.onPointerMove}
        onPointerUp={swipe.onPointerUp}
        onPointerCancel={swipe.onPointerCancel}
        onClickCapture={swipe.suppressClick}
      >
        <button type="button" className="m-card-main" onClick={onOpen}>
          <div className="m-card-row1">
            <span className={`m-sev ${p.color}`}>
              {jc(p.color)} {p.buffer >= 0 ? '+' : ''}{p.buffer}日
            </span>
            <span className="m-days">残{p.daysLeft}日</span>
            {p.trouble && <span className="m-mark trouble">困りごと</span>}
            {checked && <span className="m-mark done">確認済み</span>}
          </div>
          <div className="m-kishu">{p.kishu || '機種未設定'}</div>
          <div className="m-name">{p.name}</div>
          <div className="m-no">
            {p.partNo} <span>#{p.inst}</span>
          </div>
          <div className="m-card-row2">
            <span className="m-shop">現工程 {p.currentShop || '—'}</span>
            <span className={`m-stag${stag ? ' flag' : ''}`}>
              {stag && '🚩'}滞留{p.stagnant}日
            </span>
          </div>
        </button>
        <div className="m-card-act">
          <button
            type="button"
            className={`m-act ok${checked ? ' on' : ''}`}
            onClick={() => onCheck(!checked)}
          >
            {checked ? '確認を取消' : '今日は確認した'}
          </button>
          <button
            type="button"
            className={`m-act tr${p.trouble ? ' on' : ''}`}
            onClick={onTrouble}
          >
            {p.trouble ? '困りごとを追加' : '困りごと'}
          </button>
        </div>
      </article>
    </div>
  );
}
