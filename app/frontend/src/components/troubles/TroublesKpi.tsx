import type { ChipFilter } from '../../hooks/useTroublesFilter';
import { computeTroublesKpi } from '../../hooks/useTroublesFilter';

type Kpi = ReturnType<typeof computeTroublesKpi>;

type Props = {
  kpi: Kpi;
  filter: ChipFilter;
  onSetFilter: (next: ChipFilter) => void;
  onToggleFilter: (next: ChipFilter) => void;
};

export function TroublesKpi({ kpi, filter, onSetFilter, onToggleFilter }: Props) {
  return (
    <div className="kpi-row trouble-kpi">
      <button
        type="button"
        className={`kpi trouble ${filter === 'all' ? 'active' : ''}`}
        onClick={() => onSetFilter('all')}
        title="すべての困りごと"
      >
        <div className="num">{kpi.total}</div>
        <div className="lbl">⚠ 困りごと合計</div>
      </button>
      <button
        type="button"
        className={`kpi trouble-critical ${filter === 'critical' ? 'active' : ''}`}
        onClick={() => onToggleFilter('critical')}
        title="7日以上経過"
      >
        <div className="num">{kpi.critical}</div>
        <div className="lbl">🔴 7日以上（要対応）</div>
      </button>
      <button
        type="button"
        className={`kpi trouble-nomemo ${filter === 'nomemo' ? 'active' : ''}`}
        onClick={() => onToggleFilter('nomemo')}
        title="メモ未入力"
      >
        <div className="num">{kpi.nomemo}</div>
        <div className="lbl">📝 メモ未入力</div>
      </button>
      <button
        type="button"
        className={`kpi trouble-unassigned ${filter === 'unassigned' ? 'active' : ''}`}
        onClick={() => onToggleFilter('unassigned')}
        title="担当者未割当"
      >
        <div className="num">{kpi.unassigned}</div>
        <div className="lbl">👤 担当未割当</div>
      </button>
    </div>
  );
}
