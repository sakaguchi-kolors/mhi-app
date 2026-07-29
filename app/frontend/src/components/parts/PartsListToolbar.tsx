import type { ChipFilter } from '../../hooks/usePartsFilter';

type Props = {
  filter: ChipFilter;
  cat: string;
  owner: string;
  kishu: string;
  showShelved: boolean;
  shelvedCount: number;
  cats: string[];
  ownerOpts: string[];
  kishus: string[];
  admin?: boolean;
  onSetFilter: (f: ChipFilter) => void;
  onSetCat: (v: string) => void;
  onSetOwner: (v: string) => void;
  onSetKishu: (v: string) => void;
  onToggleShelved: () => void;
  onAutoAssign?: () => void;
};

export function PartsListToolbar({
  filter,
  cat,
  owner,
  kishu,
  showShelved,
  shelvedCount,
  cats,
  ownerOpts,
  kishus,
  admin,
  onSetFilter,
  onSetCat,
  onSetOwner,
  onSetKishu,
  onToggleShelved,
  onAutoAssign,
}: Props) {
  return (
    <div className="toolbar">
      <span className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => onSetFilter('all')}>
        すべて
      </span>
      <span className={`chip ${filter === 'risk' ? 'active' : ''}`} onClick={() => onSetFilter('risk')}>
        要注意（赤・黄）
      </span>
      <span className={`chip ${filter === 'stag' ? 'active' : ''}`} onClick={() => onSetFilter('stag')}>
        滞留🚩のみ
      </span>
      <select className="filter" value={cat} onChange={(e) => onSetCat(e.target.value)}>
        <option value="all">完成品分類：すべて</option>
        {cats.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select className="filter" value={owner} onChange={(e) => onSetOwner(e.target.value)}>
        <option value="all">担当者：すべて</option>
        {ownerOpts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <select className="filter" value={kishu} onChange={(e) => onSetKishu(e.target.value)}>
        <option value="all">機種：すべて</option>
        {kishus.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <span className={`chip ${showShelved ? 'active' : ''}`} onClick={onToggleShelved} title="保留にした部品だけを表示">
        保留だけ表示{shelvedCount > 0 ? `（${shelvedCount}）` : ''}
      </span>
      {admin && onAutoAssign && (
        <button className="chip assign-btn" onClick={onAutoAssign} title="未割当の部品を機種→担当チームに基づいて自動割り当て（既存の割当は変更しません）">
          ⚙ 未割当を自動割り当て
        </button>
      )}
    </div>
  );
}
