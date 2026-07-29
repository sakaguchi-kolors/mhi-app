import type { ChipFilter } from '../../hooks/usePartsFilter';
import { computePartsKpi } from '../../lib/parts-filter.logic';

type Kpi = ReturnType<typeof computePartsKpi>;

type Props = {
  kpi: Kpi;
  filter: ChipFilter;
  stagnantThreshold: number;
  onToggle: (next: ChipFilter) => void;
};

function sub(nn: number, tot: number) {
  return tot > 0 ? (
    <div className="kpi-sub">
      未割当 <b>{nn}</b>
    </div>
  ) : null;
}

export function PartsListKpi({ kpi, filter, stagnantThreshold, onToggle }: Props) {
  return (
    <div className="kpi-row">
      <button type="button" className={`kpi red ${filter === 'red' ? 'active' : ''}`} onClick={() => onToggle('red')} title="納期危険の部品だけ表示">
        <div className="num">{kpi.r}</div>
        <div className="lbl">🔴 納期危険（要対応）</div>
        {sub(kpi.ru, kpi.r)}
      </button>
      <button type="button" className={`kpi yellow ${filter === 'yellow' ? 'active' : ''}`} onClick={() => onToggle('yellow')} title="ギリギリの部品だけ表示">
        <div className="num">{kpi.y}</div>
        <div className="lbl">🟡 ギリギリ（要注視）</div>
        {sub(kpi.yu, kpi.y)}
      </button>
      <button type="button" className={`kpi green ${filter === 'green' ? 'active' : ''}`} onClick={() => onToggle('green')} title="余裕ありの部品だけ表示">
        <div className="num">{kpi.g}</div>
        <div className="lbl">🟢 余裕あり</div>
      </button>
      <button type="button" className={`kpi stag ${filter === 'stag' ? 'active' : ''}`} onClick={() => onToggle('stag')} title={`滞留${stagnantThreshold}日以上の部品だけ表示`}>
        <div className="num">{kpi.s}</div>
        <div className="lbl">🚩 滞留{stagnantThreshold}日以上</div>
        {sub(kpi.su, kpi.s)}
      </button>
    </div>
  );
}
