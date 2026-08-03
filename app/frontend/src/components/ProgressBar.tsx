import type { ReactNode } from 'react';
import type { Part } from '../types';
import { jc, gaicLabel, gaicPhaseLabel, gaicReqBadge, gaicEtaBadge } from '../util';

// 1Shop=1ボックスで並べる進捗バー。
// 方式：ボックスは固定サイズ（CSS .pbox）、全長は工程数ぶんだけ変動する。
// 長い工程数の部品はセル内を横スクロール（列幅はコンパクトに固定）。
export function ProgressBar({ p }: { p: Part }) {
  const tl = p.timeline;
  const n = tl.length || 1;
  const currentCell = tl.find((t) => t.status === 'current');

  return (
    <div className="pbarx">
      <div className="pboxes">
        {tl.map((t, i) => {
          const cls = t.status === 'done' ? 'done' : t.status === 'current' ? 'current' : 'wait';
          // ボックス内マーク：中間マイルストン(◎)を優先、無ければ外注(外)
          let mark: ReactNode = null;
          if (t.milestone) {
            mark = <span className={`pmk ms ${t.mpassed ? 'passed' : (t.mcolor ?? '')}`}>◎</span>;
          } else if (t.gaic) {
            mark = <span className={`pmk gaic ${t.gstat ?? ''}`}>外</span>;
          }
          const tip =
            `${i + 1}. ${t.name}（${t.shop}）` +
            (t.status === 'current' ? ' ← 現在地' : t.status === 'done' ? ' 完了' : ' 未着手') +
            (t.milestone ? (t.mpassed ? '／検査：通過済' : `／検査マイルストン 期日${t.mdue ?? '-'} 判定${t.mcolor ? jc(t.mcolor) : ''}`) : '') +
            (t.gaic ? `／外注 ${t.gstat ? gaicLabel[t.gstat] : ''}${t.gvendor ? '（' + t.gvendor + '）' : ''}${t.gphase ? '／' + gaicPhaseLabel[t.gphase] : ''}` : '');
          return (
            <div key={i} className={`pbox ${cls}`} title={tip}>
              {t.status === 'current' && <span className="pnow" title={`現在地：${p.currentShop}`}>▼</span>}
              {mark}
            </div>
          );
        })}
      </div>
      <div className="pmeta2">
        進捗 <b>{p.doneShops}/{n}</b>　現在：<span className="bar-cur">{p.currentShop}</span>
        {currentCell?.gaic && currentCell.gphase && (
          <span className="gaic-cur-flags">
            <span className={`gaic-tag sm ${currentCell.gphase === 'out_done' || currentCell.gphase === 'in_done' ? 'gaic-done' : 'gaic-wait'}`}>
              {gaicPhaseLabel[currentCell.gphase]}
            </span>
            <span className={`gaic-tag sm ${gaicReqBadge(currentCell.greq).cls}`}>{gaicReqBadge(currentCell.greq).text}</span>
            <span className={`gaic-tag sm ${gaicEtaBadge(currentCell.geta).cls}`}>{gaicEtaBadge(currentCell.geta).text}</span>
          </span>
        )}
      </div>
    </div>
  );
}
