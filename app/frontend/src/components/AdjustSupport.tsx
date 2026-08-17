import { useQuery } from '@tanstack/react-query';
import * as api from '../api';
import type { AdjustSupport as AdjustSupportData } from '../types';
import { delayTone, diffTone, formatDays, formatHs, postRecoverySub, signedDiff } from '../lib/adjust.view';
import { Loading } from './Loading';

export function AdjustSupport({ osId }: { osId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['parts', osId, 'adjust'],
    queryFn: () => api.getPartAdjust(osId),
  });

  return (
    <div className="panel adj-panel">
      <h3 className="pt">
        調整支援 <span className="adj-beta">※β</span>
      </h3>
      <p className="pt-sub">現在工程以降の Hs と 想定LT の差から、前倒し余裕を簡易試算します。</p>

      {isLoading && <Loading variant="inline" label="調整支援を計算中…" />}
      {error && <p className="adj-error">調整支援の取得に失敗しました。</p>}
      {data && <AdjustBody data={data} />}
    </div>
  );
}

function AdjustBody({ data }: { data: AdjustSupportData }) {
  if (data.rows.length === 0) {
    return <p className="adj-empty">残工程がないため、調整試算の対象はありません。</p>;
  }

  const delay = delayTone(data.delayDays);
  const recovered = data.postRecoveryDelayDays <= 0;
  const stillOver = data.postRecoveryDelayDays > 0;

  return (
    <>
      <div className="adj-kpis">
        <div className="adj-kpi">
          <span className="adj-kpi-label">遅延見込み日数</span>
          <strong className={delay === 'late' ? 'adj-num-late' : 'adj-num-ok'}>
            {formatDays(Math.max(0, data.delayDays))}
          </strong>
          <span className="adj-kpi-sub">完成予測と依頼納期の差</span>
        </div>
        <div className="adj-kpi">
          <span className="adj-kpi-label">リカバリ可能日数</span>
          <strong className={data.recoverableDays > 0 ? 'adj-num-ok' : data.recoverableDays < 0 ? 'adj-num-late' : ''}>
            {formatDays(data.recoverableDays)}
          </strong>
          <span className="adj-kpi-sub">後続工程以降の前倒し余裕</span>
        </div>
        <div className="adj-kpi">
          <span className="adj-kpi-label">リカバリ後納期予測</span>
          <strong className={stillOver ? 'adj-num-late' : 'adj-num-ok'}>
            {data.postRecoveryDate ?? '—'}
          </strong>
          <span className="adj-kpi-sub">{postRecoverySub(data)}</span>
        </div>
      </div>

      {stillOver && (
        <div className="adj-alert adj-alert-late">
          Hs差分による調整余裕を織り込んでも納期超過が残るため、SHOP内での優先順位変更検討が必要です。
        </div>
      )}
      {data.delayDays > 0 && recovered && (
        <div className="adj-alert adj-alert-ok">
          Hs通りに進めれば、納期内にリカバリできる見込みです。
        </div>
      )}

      <div className="adj-table-wrap">
        <table className="adj-table">
          <thead>
            <tr>
              <th>工程</th>
              <th className="num">Hs</th>
              <th className="num">HsLT</th>
              <th className="num">想定LT</th>
              <th className="num">差分</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => {
              const tone = diffTone(row.diffDays);
              return (
                <tr key={`${row.shop}-${i}`}>
                  <td>
                    <div className="adj-proc">{row.name || row.shop}</div>
                    <div className="adj-shop">Shop {row.shop}</div>
                  </td>
                  <td className="num">{formatHs(row.hsHours)}</td>
                  <td className="num">{row.hsLtDays == null ? '—' : formatDays(row.hsLtDays)}</td>
                  <td className="num">{formatDays(row.expectedLtDays)}</td>
                  <td className={`num adj-diff adj-diff-${tone}`}>{signedDiff(row.diffDays)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="adj-note">
        ※ 連続する同一SHOPの Hs を合計し、{data.hoursPerDay}時間＝1日（0.5日単位）で HsベースLT を算出しています。
        想定LT が HsベースLT より長い工程の差だけを前倒し余裕として集計しています。
      </p>
    </>
  );
}
