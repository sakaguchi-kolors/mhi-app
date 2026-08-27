// 受信箱の1件。メールアプリの一覧行に相当し、タップで詳細に入る。
import type { Part } from '../../types';
import { jc } from '../../util';
import { isStagnant } from '../../lib/mobile-inbox.logic';

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
  onTrouble: (on: boolean) => void;
}) {
  const stag = isStagnant(p, stagnantThreshold);

  return (
    <article className={`m-card ${p.color}${checked ? ' checked' : ''}`}>
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
          onClick={() => onTrouble(!p.trouble)}
        >
          {p.trouble ? '困りごとを解除' : '困りごと'}
        </button>
      </div>
    </article>
  );
}
