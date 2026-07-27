import { useCallback, useEffect, useState } from 'react';
import type { AuditDetailRow, MasterDef } from '../../types';
import * as api from '../../api';
import { fmtDateTime, str } from './shared';

export const MASTER_HISTORY_TAB = 'history';

const PAGE_SIZES = [20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;
export const CSV_MAX_ROWS = 10000;

function csvOverLimitMessage(total: number): string {
  return `該当件数が${total.toLocaleString('ja-JP')}件あります。CSV出力は最大${CSV_MAX_ROWS.toLocaleString('ja-JP')}件です。期間やマスタで絞り込んでください。`;
}

const ACTION_LABEL: Record<string, string> = {
  'master.insert': '新規',
  'master.update': '更新',
  'master.delete': '削除',
  'master.import': '取込',
};

const SKIP_KEYS = new Set(['created_at', 'created_by', 'updated_at', 'updated_by']);

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 当月1日〜末日（ローカル日付） */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: ymd(from), to: ymd(to) };
}

function formatVal(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'はい' : 'いいえ';
  return String(v);
}

function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((k) => !SKIP_KEYS.has(k) && formatVal(before?.[k]) !== formatVal(after?.[k]));
}

type Props = {
  defs: MasterDef[];
  toast: { show: (msg: string) => void };
};

export function AuditSearch({ defs, toast }: Props) {
  const monthDefault = currentMonthRange();
  const [from, setFrom] = useState(monthDefault.from);
  const [to, setTo] = useState(monthDefault.to);
  const [target, setTarget] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [rows, setRows] = useState<AuditDetailRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (overrides?: { page?: number; pageSize?: number }) => {
      const pageNum = overrides?.page ?? page;
      const size = overrides?.pageSize ?? pageSize;
      setLoading(true);
      try {
        const r = await api.searchAudit({
          from,
          to,
          target: target || undefined,
          actionPrefix: 'master.',
          page: pageNum,
          pageSize: size,
        });
        setRows(r.items);
        setTotal(r.total);
        setPage(r.page);
        setPageSize(r.pageSize);
      } catch (e) {
        console.error(e);
        toast.show(e instanceof Error ? e.message : '履歴の検索に失敗しました');
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [from, to, target, page, pageSize, toast],
  );

  useEffect(() => {
    load({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const fromIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIdx = Math.min(page * pageSize, total);

  const runSearch = () => {
    load({ page: 1 });
  };

  const downloadCsv = async () => {
    if (total > CSV_MAX_ROWS) {
      toast.show(csvOverLimitMessage(total));
      return;
    }
    try {
      await api.downloadAuditCsv({
        from,
        to,
        target: target || undefined,
        actionPrefix: 'master.',
      });
    } catch (e) {
      console.error(e);
      toast.show(e instanceof Error ? e.message : 'CSV出力に失敗しました');
    }
  };

  const tableLabel = (t: string) => defs.find((d) => d.table === t)?.label ?? t;
  const csvBlocked = total > CSV_MAX_ROWS;

  return (
    <div className="audit-search">
      <div className="audit-search-form">
        <label className="audit-field">
          <span>開始日</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="audit-field">
          <span>終了日</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="audit-field">
          <span>マスタ</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">すべて</option>
            {defs.map((d) => (
              <option key={d.name} value={d.table}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <div className="audit-search-btns">
          <button type="button" className="mbtn save" onClick={runSearch} disabled={loading}>
            {loading ? '検索中…' : '検索'}
          </button>
          <button type="button" className="mbtn hist" onClick={downloadCsv} disabled={loading || csvBlocked}>
            CSV出力
          </button>
        </div>
        <p className="mnote" style={{ margin: '8px 0 0', width: '100%' }}>
          CSV出力は最大 {CSV_MAX_ROWS.toLocaleString('ja-JP')} 件です。
          {csvBlocked && (
            <span className="param-warn" style={{ display: 'block', marginTop: 4 }}>
              {csvOverLimitMessage(total)}
            </span>
          )}
        </p>
      </div>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <p className="mnote">{loading ? '読み込み中…' : `${total.toLocaleString()} 件（新しい順）`}</p>
        <table className="audit-result">
          <thead>
            <tr>
              <th>日時</th>
              <th>操作者</th>
              <th>操作</th>
              <th>マスタ</th>
              <th>キー</th>
              <th>変更内容</th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              rows.map((r, i) => {
                const fields = diffFields(r.before, r.after);
                const summary =
                  fields.length === 0
                    ? '—'
                    : fields.map((k) => `${k}: ${formatVal(r.before?.[k])} → ${formatVal(r.after?.[k])}`).join(' / ');
                return (
                  <tr key={i}>
                    <td>{fmtDateTime(r.at)}</td>
                    <td>{r.app_user ?? '—'}</td>
                    <td>{ACTION_LABEL[str(r.action)] ?? str(r.action)}</td>
                    <td>{tableLabel(str(r.target))}</td>
                    <td><code>{r.ref}</code></td>
                    <td className="audit-diff">{summary}</td>
                  </tr>
                );
              })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 12 }}>
                  該当する履歴はありません
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {total > 0 && (
          <div className="pager">
            <span className="pager-info">
              {fromIdx.toLocaleString()}–{toIdx.toLocaleString()} / {total.toLocaleString()} 件
            </span>
            <label className="pager-size">
              表示件数
              <select
                className="filter"
                value={pageSize}
                onChange={(e) => load({ page: 1, pageSize: Number(e.target.value) })}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="pager-nav">
              <button
                type="button"
                className="chip"
                disabled={loading || page <= 1}
                onClick={() => load({ page: page - 1 })}
              >
                前へ
              </button>
              <span className="pager-page">
                {page} / {pageCount}
              </span>
              <button
                type="button"
                className="chip"
                disabled={loading || page >= pageCount}
                onClick={() => load({ page: page + 1 })}
              >
                次へ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
