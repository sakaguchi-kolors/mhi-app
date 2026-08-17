// 工程ヒートマップ：どの工程に、いつ部品が集中しそうかを一目で見る画面。
// 左に「今すでに詰まっている量」、右に「これから流れ込む量」を並べる。
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import type { HeatCellParams } from '../api';
import type { Color, HeatRow } from '../types';
import { routes } from '../routes';
import { HEAT_MODE_LABEL } from '../lib/heatmap.view';
import { HeatmapToolbar, type HeatmapControls } from './heatmap/HeatmapToolbar';
import { HeatmapGrid, type SelectedCell } from './heatmap/HeatmapGrid';
import { HeatmapCellDrawer } from './heatmap/HeatmapCellDrawer';
import { Loading } from './Loading';

const LEGEND = [
  { level: 'empty', label: '予定なし' },
  { level: 'low', label: '平常' },
  { level: 'warn', label: 'やや混雑' },
  { level: 'alert', label: '混雑' },
  { level: 'crit', label: '過密' },
] as const;

const PART_LEGEND = [
  { level: 'empty', label: '予定なし' },
  { level: 'low', label: '緑（余裕あり）' },
  { level: 'alert', label: '黄（注意）' },
  { level: 'crit', label: '赤（危険）' },
] as const;

interface Props {
  owners: string[];
  stagnantThreshold?: number;
  /** 工程員は自分の担当を初期選択 */
  defaultOwnerFilter?: string;
  onOpenPart: (id: string) => void;
}

export function Heatmap({ owners, stagnantThreshold = 10, defaultOwnerFilter, onOpenPart }: Props) {
  const navigate = useNavigate();
  const [ctrl, setCtrl] = useState<HeatmapControls>({
    mode: 'arrival',
    unit: 'week',
    groupBy: 'shop',
    count: 12,
    kishu: '',
    category: '',
    owner: defaultOwnerFilter ?? '',
    color: '',
  });
  const [selected, setSelected] = useState<SelectedCell | null>(null);

  const filters = useMemo(
    () => ({
      kishu: ctrl.kishu || undefined,
      category: ctrl.category || undefined,
      owner: ctrl.owner || undefined,
      color: (ctrl.color || undefined) as Color | undefined,
    }),
    [ctrl.kishu, ctrl.category, ctrl.owner, ctrl.color],
  );

  const params = useMemo(
    () => ({ mode: ctrl.mode, unit: ctrl.unit, groupBy: ctrl.groupBy, count: ctrl.count, ...filters }),
    [ctrl.mode, ctrl.unit, ctrl.groupBy, ctrl.count, filters],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['heatmap', params],
    queryFn: () => api.getHeatmap(params),
  });

  const patch = (p: Partial<HeatmapControls>): void => {
    setSelected(null);
    setCtrl((prev) => ({ ...prev, ...p }));
  };

  // 行見出しのクリック。部品行は詳細へ、工程行はその工程で絞った部品一覧へ
  const openRow = (row: HeatRow): void => {
    if (row.osId) {
      onOpenPart(row.osId);
      return;
    }
    const q = new URLSearchParams({ shop: row.shop });
    if (row.job) q.set('job', row.job);
    navigate(`${routes.parts}?${q}`);
  };

  const cellParams: HeatCellParams | null = selected
    ? {
        mode: ctrl.mode,
        groupBy: ctrl.groupBy,
        shop: selected.row.shop,
        job: selected.row.job,
        from: selected.bucket.from,
        to: selected.bucket.to,
        ...filters,
      }
    : null;

  const t = data?.thresholds;
  const isPartView = ctrl.groupBy === 'part';
  const truncated = !!data && data.totalRows > data.rows.length;

  return (
    <section>
      <HeatmapToolbar
        value={ctrl}
        kishus={data?.kishus ?? []}
        categories={data?.categories ?? []}
        owners={owners}
        onChange={patch}
        onReset={() => patch({ kishu: '', category: '', owner: '', color: '' })}
      />

      <div className="panel panel-loading-wrap">
        {isLoading && <Loading variant="veil" label="集計中…" />}

        <div className="heat-legend">
          <span className="heat-legend-title">
            {isPartView ? '部品ごとの滞在予定' : `${HEAT_MODE_LABEL[ctrl.mode]}の件数`}
          </span>
          {(isPartView ? PART_LEGEND : LEGEND).map((l) => (
            <span key={l.level} className="heat-legend-item">
              <span className={`heat-swatch lv-${l.level}`} aria-hidden />
              {l.label}
            </span>
          ))}
          <span className="heat-legend-note">
            {isPartView ? (
              <>
                縦が部品、横が期間。セルはその期間に滞在予定の SHOP コードで、色は部品自身の緊急度です。
                行またはセルのクリックで部品詳細へ移動します。
              </>
            ) : (
              t && (
                <>
                  各工程の平常時（部品が入る期間の平均件数）に対して {t.warn}倍で黄・{t.alert}倍で赤・{t.crit}倍で濃赤。
                  {t.minCount}件未満は混雑判定せず平常とします。0件は — です。
                  {t.absAlert > 0 && `件数そのものが ${t.absAlert}件以上でも赤になります。`}
                  　工程名のクリックでその工程の部品一覧、セルのクリックでその期間の内訳を開きます。
                </>
              )
            )}
            {truncated && `　※ 対象 ${data.totalRows} 行のうち上位 ${data.rows.length} 行を表示しています。`}
          </span>
        </div>

        {error && <div className="heat-empty">集計に失敗しました：{String(error)}</div>}

        {data && (
          <HeatmapGrid
            rows={data.rows}
            buckets={data.buckets}
            unit={data.unit}
            stagnantThreshold={stagnantThreshold}
            selected={selected}
            onSelect={setSelected}
            onOpenRow={openRow}
          />
        )}
      </div>

      {selected && cellParams && !isPartView && (
        <HeatmapCellDrawer
          selected={selected}
          params={cellParams}
          unit={ctrl.unit}
          onClose={() => setSelected(null)}
          onOpenPart={onOpenPart}
        />
      )}
    </section>
  );
}
