import { useEffect, useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type PaginationState,
} from '@tanstack/react-table';
import type { Part } from '../types';
import { jc } from '../util';
import { useTroublesFilter, troubleUrgency, troubleUrgencyLabel } from '../hooks/useTroublesFilter';
import { MemoModal } from './shared/MemoModal';
import { TroublesKpi } from './troubles/TroublesKpi';
import { TroublesToolbar } from './troubles/TroublesToolbar';

const PAGE_SIZES = [30, 50, 100] as const;

interface Props {
  parts: Part[];
  defaultOwnerFilter?: string;
  onOpen: (id: string) => void;
  onTrouble: (id: string, flagged: boolean) => void;
  onMemo: (id: string, memo: string) => void;
}

export function TroublesDashboard({ parts, defaultOwnerFilter, onOpen, onTrouble, onMemo }: Props) {
  const troubles = useMemo(() => parts.filter((p) => p.trouble), [parts]);
  const {
    filter,
    setFilter,
    toggleFilter,
    cat,
    setCat,
    owner,
    setOwner,
    kishu,
    setKishu,
    filtered,
    cats,
    kishus,
    ownerOpts,
    kpi,
  } = useTroublesFilter(troubles, defaultOwnerFilter);

  const [sorting, setSorting] = useState<SortingState>([{ id: 'troubleDays', desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 30 });
  const [memoFor, setMemoFor] = useState<Part | null>(null);

  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [filter, cat, owner, kishu]);

  const columns = useMemo<ColumnDef<Part>[]>(
    () => [
      {
        id: 'troubleDays',
        header: '経過',
        accessorFn: (p) => p.troubleDays ?? -1,
        sortingFn: (a, b) => (b.original.troubleDays ?? -1) - (a.original.troubleDays ?? -1),
        cell: ({ row }) => {
          const p = row.original;
          const u = troubleUrgency(p.troubleDays);
          return (
            <div className={`trouble-age ${u}`}>
              <div className="trouble-age-num">
                {p.troubleDays ?? 0}
                <span className="u">日</span>
              </div>
              <div className="trouble-age-lbl">{troubleUrgencyLabel(p.troubleDays)}</div>
            </div>
          );
        },
      },
      {
        id: 'name',
        header: '部品',
        accessorFn: (p) => p.name,
        sortingFn: (a, b) => a.original.name.localeCompare(b.original.name),
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div>
              <div className="pname">{p.name}</div>
              <div className="pno">
                {p.partNo} <span style={{ opacity: 0.7 }}>#{p.inst}</span>
              </div>
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <span className="cat-tag">{p.category}</span>
                {p.kishu && (
                  <span className="cat-tag" style={{ background: '#f4f6fa', color: 'var(--muted)' }}>
                    {p.kishu}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: 'memo',
        header: '困りごと内容',
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          const text = (p.memo ?? '').trim();
          return (
            <div className="trouble-memo-cell" onClick={(e) => e.stopPropagation()}>
              {text ? (
                <p className="trouble-memo-text" title={text}>
                  {text}
                </p>
              ) : (
                <p className="trouble-memo-empty">メモ未入力 — 内容を記録してください</p>
              )}
              <button type="button" className={`memo-btn ${text ? 'has' : ''}`} onClick={() => setMemoFor(p)}>
                📝 {text ? '編集' : '追加'}
              </button>
            </div>
          );
        },
      },
      {
        id: 'sev',
        header: '納期状態',
        accessorFn: (p) => p.color,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <span className={`state-pill ${p.color}`}>
              {jc(p.color)}　{p.buffer >= 0 ? '+' : ''}
              {p.buffer}日
            </span>
          );
        },
      },
      {
        id: 'owner',
        header: '担当者',
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          const cur = p.owner ?? '未割当';
          return <span className={cur === '未割当' ? 'od none' : 'od'}>{cur}</span>;
        },
      },
      {
        id: 'actions',
        header: '操作',
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="trouble-actions" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="chip trouble-resolve"
                onClick={() => {
                  if (confirm('この困りごとを解決済みにしますか？')) onTrouble(p.id, false);
                }}
              >
                ✓ 解決
              </button>
            </div>
          );
        },
      },
    ],
    [onTrouble],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const total = filtered.length;
  const pageCount = table.getPageCount();
  const pageIndex = pagination.pageIndex;
  const pageSize = pagination.pageSize;
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, total);

  if (troubles.length === 0) {
    return (
      <section>
        <div className="trouble-empty panel">
          <div className="trouble-empty-icon" aria-hidden>
            ✓
          </div>
          <h2>困りごとはありません</h2>
          <p>部品一覧で困りごとにチェックを入れると、ここに一覧表示されます。</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="trouble-intro panel">
        <div>
          <h2 className="trouble-intro-title">
            現在 <b>{troubles.length}</b> 件の困りごと
          </h2>
          <p className="trouble-intro-sub">経過日数が長いものほど優先的に確認してください。行をクリックすると部品詳細へ移動します。</p>
        </div>
      </div>

      <TroublesKpi kpi={kpi} filter={filter} onSetFilter={setFilter} onToggleFilter={toggleFilter} />
      <TroublesToolbar
        filter={filter}
        cat={cat}
        owner={owner}
        kishu={kishu}
        cats={cats}
        ownerOpts={ownerOpts}
        kishus={kishus}
        onToggleFilter={toggleFilter}
        onCatChange={setCat}
        onOwnerChange={setOwner}
        onKishuChange={setKishu}
      />

      <div className="panel">
        <div className="table-wrap">
          <table className="trouble-table">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className={h.column.getCanSort() ? 'sortable' : ''}
                      style={{ textAlign: h.column.id === 'name' || h.column.id === 'memo' ? 'left' : 'center' }}
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {{ asc: ' ▲', desc: ' ▼' }[h.column.getIsSorted() as string] ?? ''}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const u = troubleUrgency(row.original.troubleDays);
                return (
                  <tr key={row.id} className={`trouble-row trouble-row-${u}`} onClick={() => onOpen(row.original.id)}>
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{
                          textAlign: ['troubleDays', 'sev', 'owner', 'actions'].includes(cell.column.id) ? 'center' : 'left',
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {total === 0 && (
                <tr>
                  <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>
                    フィルタ条件に該当する困りごとはありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="pager">
            <span className="pager-info">
              {from.toLocaleString()}–{to.toLocaleString()} / {total.toLocaleString()} 件
            </span>
            <label className="pager-size">
              表示件数
              <select className="filter" value={pageSize} onChange={(e) => table.setPageSize(Number(e.target.value))}>
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="pager-nav">
              <button type="button" className="chip" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                前へ
              </button>
              <span className="pager-page">
                {pageIndex + 1} / {pageCount}
              </span>
              <button type="button" className="chip" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                次へ
              </button>
            </div>
          </div>
        )}
      </div>

      {memoFor && (
        <MemoModal
          part={memoFor}
          title="困りごとメモ"
          onClose={() => setMemoFor(null)}
          onSave={(text) => {
            onMemo(memoFor.id, text);
            setMemoFor(null);
          }}
        />
      )}
    </section>
  );
}
