import type { Color, HeatGroupBy, HeatMode, HeatUnit } from '../../types';

const WEEK_COUNTS = [8, 12, 16, 26] as const;
const DAY_COUNTS = [14, 21, 30, 60] as const;

export interface HeatmapControls {
  mode: HeatMode;
  unit: HeatUnit;
  groupBy: HeatGroupBy;
  count: number;
  kishu: string;
  category: string;
  owner: string;
  color: '' | Color;
}

interface Props {
  value: HeatmapControls;
  kishus: string[];
  categories: string[];
  owners: string[];
  onChange: (patch: Partial<HeatmapControls>) => void;
  onReset: () => void;
}

export function HeatmapToolbar({ value, kishus, categories, owners, onChange, onReset }: Props) {
  const counts = value.unit === 'week' ? WEEK_COUNTS : DAY_COUNTS;
  const filtered = !!(value.kishu || value.category || value.owner || value.color);

  return (
    <div className="panel heat-toolbar">
      <div className="heat-toolbar-row">
        <div className="seg" role="group" aria-label="数え方">
          <button
            type="button"
            className={`seg-btn${value.mode === 'arrival' ? ' active' : ''}`}
            onClick={() => onChange({ mode: 'arrival' })}
            title="その期間に着手予定の部品を数える。「同じ時期に何件入ってくるか」"
          >
            流入
          </button>
          <button
            type="button"
            className={`seg-btn${value.mode === 'occupancy' ? ' active' : ''}`}
            onClick={() => onChange({ mode: 'occupancy' })}
            title="その期間に工程に居る予定の部品を数える。実際の混み具合"
          >
            在席
          </button>
        </div>

        <div className="seg" role="group" aria-label="期間の粒度">
          <button
            type="button"
            className={`seg-btn${value.unit === 'week' ? ' active' : ''}`}
            onClick={() => onChange({ unit: 'week', count: 12 })}
          >
            週
          </button>
          <button
            type="button"
            className={`seg-btn${value.unit === 'day' ? ' active' : ''}`}
            onClick={() => onChange({ unit: 'day', count: 21 })}
          >
            日
          </button>
        </div>

        <div className="seg" role="group" aria-label="行のまとめ方">
          <button
            type="button"
            className={`seg-btn${value.groupBy === 'shop' ? ' active' : ''}`}
            onClick={() => onChange({ groupBy: 'shop' })}
          >
            SHOP
          </button>
          <button
            type="button"
            className={`seg-btn${value.groupBy === 'job' ? ' active' : ''}`}
            onClick={() => onChange({ groupBy: 'job' })}
            title="SHOP×JOB まで分けて表示"
          >
            SHOP×JOB
          </button>
          <button
            type="button"
            className={`seg-btn${value.groupBy === 'part' ? ' active' : ''}`}
            onClick={() => onChange({ groupBy: 'part' })}
            title="部品ごとに、いつどの工程に居る予定かを帯で表示。色は部品の緊急度"
          >
            部品
          </button>
        </div>

        <label className="heat-field">
          表示期間
          <select className="filter" value={value.count} onChange={(e) => onChange({ count: Number(e.target.value) })}>
            {counts.map((n) => (
              <option key={n} value={n}>
                {n}
                {value.unit === 'week' ? '週' : '日'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="heat-toolbar-row">
        <label className="heat-field">
          機種
          <select className="filter" value={value.kishu} onChange={(e) => onChange({ kishu: e.target.value })}>
            <option value="">すべて</option>
            {kishus.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>

        <label className="heat-field">
          分類
          <select className="filter" value={value.category} onChange={(e) => onChange({ category: e.target.value })}>
            <option value="">すべて</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="heat-field">
          担当者
          <select className="filter" value={value.owner} onChange={(e) => onChange({ owner: e.target.value })}>
            <option value="">すべて</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className="heat-field">
          緊急度
          <select
            className="filter"
            value={value.color}
            onChange={(e) => onChange({ color: e.target.value as '' | Color })}
          >
            <option value="">すべて</option>
            <option value="red">赤のみ</option>
            <option value="yellow">黄のみ</option>
            <option value="green">緑のみ</option>
          </select>
        </label>

        {filtered && (
          <button type="button" className="chip" onClick={onReset}>
            絞り込みを解除
          </button>
        )}
      </div>
    </div>
  );
}
