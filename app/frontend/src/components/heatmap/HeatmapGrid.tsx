import type { HeatBucket, HeatRow, HeatUnit } from '../../types';
import { bucketLabel, cellClass, cellShares, cellTitle, peakBucket } from '../../lib/heatmap.view';

export interface SelectedCell {
  row: HeatRow;
  bucket: HeatBucket;
}

interface Props {
  rows: HeatRow[];
  buckets: HeatBucket[];
  unit: HeatUnit;
  stagnantThreshold: number;
  selected: SelectedCell | null;
  onSelect: (sel: SelectedCell) => void;
  /** 行見出しのクリック。工程行はその工程の部品一覧、部品行は部品詳細へ */
  onOpenRow: (row: HeatRow) => void;
}

export function HeatmapGrid({ rows, buckets, unit, stagnantThreshold, selected, onSelect, onOpenRow }: Props) {
  if (!rows.length) {
    return <div className="heat-empty">表示期間に予定されている工程がありません。</div>;
  }

  return (
    <div className="heat-scroll">
      <table className="heat-table">
        <thead>
          <tr>
            <th className="heat-head-shop">{rows[0].osId ? '部品' : '工程'}</th>
            <th className="heat-head-now" title="現在この工程で仕掛中の部品数と、その平均滞留日数">
              現在の滞留
            </th>
            {buckets.map((b) => (
              <th key={b.from} className="heat-head-bucket" title={`${b.from} 〜 ${b.to}`}>
                {bucketLabel(b, unit)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const peak = peakBucket(row, buckets, unit);
            const stagFlag = row.avgStagnant >= stagnantThreshold;
            const isPart = !!row.osId;
            return (
              <tr key={row.key}>
                <th className="heat-head-shop">
                  <button
                    type="button"
                    className="heat-row-btn"
                    onClick={() => onOpenRow(row)}
                    title={`${row.name}（${row.sub}）\n${isPart ? 'クリックで部品詳細' : 'クリックでこの工程の部品一覧'}`}
                  >
                    <span className="heat-shop-name">{row.name}</span>
                    <span className="heat-shop-code">
                      {row.sub}
                      {peak && <span className="heat-peak">{peak}ピーク</span>}
                    </span>
                  </button>
                </th>
                <td className={`heat-now${stagFlag ? ' heat-now-flag' : ''}${row.wipCount > 0 ? ' has-wip' : ''}`}>
                  <div className="heat-now-inner">
                    {row.wipCount > 0 ? (
                      <>
                        <span className="heat-now-wip">{isPart ? '仕掛' : `${row.wipCount}件`}</span>
                        <span className="heat-now-stag">
                          {isPart ? '' : '平均'}
                          {row.avgStagnant}日
                        </span>
                      </>
                    ) : (
                      <span className="heat-now-none">—</span>
                    )}
                  </div>
                </td>
                {row.cells.map((cell, i) => {
                  const bucket = buckets[i];
                  const isSel = selected?.row.key === row.key && selected?.bucket.from === bucket.from;
                  const shares = cellShares(cell);
                  return (
                    <td key={bucket.from} className="heat-td">
                      <button
                        type="button"
                        className={`${cellClass(cell)}${isSel ? ' selected' : ''}`}
                        title={cellTitle(row, bucket, cell, unit)}
                        disabled={cell.count === 0}
                        onClick={() => (isPart ? onOpenRow(row) : onSelect({ row, bucket }))}
                      >
                        {isPart ? (
                          <span className="heat-cell-label">{cell.label || '—'}</span>
                        ) : (
                          <>
                            <span className="heat-count">{cell.count > 0 ? cell.count : '—'}</span>
                            {cell.count > 0 && (
                              <span className="heat-bar" aria-hidden>
                                <span className="seg red" style={{ width: `${shares.red}%` }} />
                                <span className="seg yellow" style={{ width: `${shares.yellow}%` }} />
                                <span className="seg green" style={{ width: `${shares.green}%` }} />
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
