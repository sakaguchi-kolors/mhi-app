import type { ChipFilter } from '../../hooks/useTroublesFilter';

type Props = {
  filter: ChipFilter;
  cat: string;
  owner: string;
  kishu: string;
  cats: string[];
  ownerOpts: string[];
  kishus: string[];
  onToggleFilter: (next: ChipFilter) => void;
  onCatChange: (value: string) => void;
  onOwnerChange: (value: string) => void;
  onKishuChange: (value: string) => void;
};

export function TroublesToolbar({
  filter,
  cat,
  owner,
  kishu,
  cats,
  ownerOpts,
  kishus,
  onToggleFilter,
  onCatChange,
  onOwnerChange,
  onKishuChange,
}: Props) {
  return (
    <div className="toolbar">
      <span className={`chip ${filter === 'fresh' ? 'active' : ''}`} onClick={() => onToggleFilter('fresh')}>
        0〜2日
      </span>
      <span className={`chip ${filter === 'watch' ? 'active' : ''}`} onClick={() => onToggleFilter('watch')}>
        3〜6日
      </span>
      <span className={`chip ${filter === 'critical' ? 'active' : ''}`} onClick={() => onToggleFilter('critical')}>
        7日以上
      </span>
      <select className="filter" value={cat} onChange={(e) => onCatChange(e.target.value)}>
        <option value="all">完成品分類：すべて</option>
        {cats.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select className="filter" value={owner} onChange={(e) => onOwnerChange(e.target.value)}>
        <option value="all">担当者：すべて</option>
        {ownerOpts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <select className="filter" value={kishu} onChange={(e) => onKishuChange(e.target.value)}>
        <option value="all">機種：すべて</option>
        {kishus.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    </div>
  );
}
