import { useEffect, useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel, flexRender,
  type ColumnDef, type SortingState, type PaginationState,
} from '@tanstack/react-table';
import type { Part } from '../types';
import { sevRank, jc } from '../util';
import { ProgressBar } from './ProgressBar';
import { usePartsFilter } from '../hooks/usePartsFilter';
import { usePagedTableTransition } from '../hooks/usePagedTableTransition';
import { PartsListKpi } from './parts/PartsListKpi';
import { PartsListToolbar } from './parts/PartsListToolbar';
import { MemoModal } from './shared/MemoModal';
import { Loading } from './Loading';

const PAGE_SIZES = [30, 50, 100, 500] as const;

interface Props {
  parts: Part[];
  owners: string[];
  stagnantThreshold?: number;
  admin?: boolean;
  defaultOwnerFilter?: string; // 工程員は自分の担当のみ表示
  onAutoAssign?: () => void;
  onOpen: (id: string) => void;
  onOwner: (id: string, owner: string) => void;
  onTrouble: (id: string, flagged: boolean) => void;
  onShelved: (id: string, flagged: boolean) => void;
  onMemo: (id: string, memo: string) => void;
}

export function PartsList({ parts, owners, stagnantThreshold = 10, admin, defaultOwnerFilter, onAutoAssign, onOpen, onOwner, onTrouble, onShelved, onMemo }: Props) {
  const {
    filter,
    query,
    cat,
    owner,
    kishu,
    showShelved,
    setQuery,
    setCat,
    setOwner,
    setKishu,
    setShowShelved,
    toggleFilter,
    setFilter,
    filtered,
    shelvedCount,
    cats,
    kishus,
    ownerOpts,
    kpi,
  } = usePartsFilter(parts, stagnantThreshold, defaultOwnerFilter);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'sev', desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 30 });
  const [memoFor, setMemoFor] = useState<Part | null>(null);
  const { busy: pageBusy, runTransition } = usePagedTableTransition();

  const total = filtered.length;
  const pageIndex = pagination.pageIndex;
  const pageSize = pagination.pageSize;

  useEffect(() => { setPagination((p) => ({ ...p, pageIndex: 0 })); }, [filter, query, cat, owner, kishu, showShelved]);

  const columns = useMemo<ColumnDef<Part>[]>(() => [
    {
      id: 'kishu', header: '機種', accessorFn: (p) => p.kishu,
      sortingFn: (a, b) => (a.original.kishu || '').localeCompare(b.original.kishu || ''),
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div style={{ fontWeight: 700 }}>{p.kishu || '—'}</div>
        );
      },
    },
    {
      id: 'sev', header: '状態 / バッファ', accessorFn: (p) => p.color,
      sortingFn: (a, b) => (sevRank[a.original.color] - sevRank[b.original.color]) || (a.original.buffer - b.original.buffer),
      cell: ({ row }) => {
        const p = row.original;
        return <span className={`state-pill ${p.color}`}>{jc(p.color)}　{p.buffer >= 0 ? '+' : ''}{p.buffer}日</span>;
      },
    },
    {
      id: 'name', header: '部品', accessorFn: (p) => p.name, enableSorting: true,
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name),
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div>
            <div className="pname">{p.name}</div>
            <div className="pno">{p.partNo} <span style={{ opacity: 0.7 }}>#{p.inst}</span></div>
            <span className="cat-tag">{p.category}</span>
            {p.urgent && <span className="flag urg">赤紙</span>}
            {p.shortage && <span className="flag sho">子部品欠品</span>}
            {p.shelved && <span className="flag shelved">保留</span>}
          </div>
        );
      },
    },
    { id: 'progress', header: '進捗（Shop工程）', enableSorting: false, cell: ({ row }) => <ProgressBar p={row.original} /> },
    {
      id: 'stag', header: '滞留状況', accessorFn: (p) => p.stagnant, sortingFn: (a, b) => b.original.stagnant - a.original.stagnant,
      cell: ({ row }) => {
        const p = row.original; const flag = p.stagnant >= stagnantThreshold;
        // セルの `flag` クラスがバッジ用 .flag{display:inline-block} と衝突するため、縦並びを明示
        return (
          <div className={`stag-cell ${flag ? 'flag' : 'ok'}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span className="stag-days">{p.stagnant}<span className="u">日</span></span>
            {flag ? <span className="flag stag">🚩{stagnantThreshold}日超</span> : <span className="stag-ok">問題なし</span>}
          </div>
        );
      },
    },
    {
      id: 'due', header: '最終納期', accessorFn: (p) => p.daysLeft, sortingFn: (a, b) => a.original.daysLeft - b.original.daysLeft,
      cell: ({ row }) => {
        const p = row.original;
        return (<div><div className={`due ${p.daysLeft < 0 ? 'due-late' : 'due-ok'}`}>{p.finalDue}</div><div className="buf-note">残{p.daysLeft}日</div></div>);
      },
    },
    {
      id: 'owner', header: '担当者', enableSorting: false,
      cell: ({ row }) => {
        const p = row.original; const cur = p.owner ?? '未割当';
        // 現在値が候補外（例: 旧管理者割当）でも表示できるよう含める
        const opts = owners.includes(cur) ? owners : [...owners, cur];
        return (
          <div className="own-wrap">
            <select className={`own-sel ${cur === '未割当' ? 'unassigned' : ''}`} value={cur}
              onClick={(e) => e.stopPropagation()} onChange={(e) => onOwner(p.id, e.target.value)}>
              {opts.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        );
      },
    },
    {
      id: 'ownerDays', header: '割当経過', accessorFn: (p) => p.ownerDays ?? -1, sortingFn: (a, b) => (b.original.ownerDays ?? -1) - (a.original.ownerDays ?? -1),
      cell: ({ row }) => {
        const p = row.original; const cur = p.owner ?? '未割当';
        if (cur === '未割当') return <span className="od none">未割当</span>;
        return <span className="od">{p.ownerDays}日</span>;
      },
    },
    {
      id: 'trouble', header: '困りごと', enableSorting: false,
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="trouble-wrap" style={{ alignItems: 'center' }}>
            <label className="trouble-lb" onClick={(e) => e.stopPropagation()} title="困りごと">
              <input type="checkbox" checked={!!p.trouble} onChange={(e) => onTrouble(p.id, e.target.checked)} />
            </label>
            {p.trouble && (
              <div className="tr-sub">
                <button className={`memo-btn ${p.memo ? 'has' : ''}`} title={p.memo ? 'メモを編集' : 'メモを追加'}
                  onClick={(e) => { e.stopPropagation(); setMemoFor(p); }}>📝{p.memo ? <span className="dot" /> : null}</button>
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'troubleDays', header: '困りごと経過', accessorFn: (p) => p.troubleDays ?? -1, sortingFn: (a, b) => (b.original.troubleDays ?? -1) - (a.original.troubleDays ?? -1),
      cell: ({ row }) => {
        const p = row.original;
        if (!p.trouble) return <span className="stag-ok">—</span>;
        return <span className="td">{p.troubleDays}日</span>;
      },
    },
    {
      id: 'shelved', header: '保留', enableSorting: false,
      cell: ({ row }) => {
        const p = row.original;
        return (
          <label className="trouble-lb" onClick={(e) => e.stopPropagation()}
            title="一旦置いておく（通常一覧から非表示）">
            <input type="checkbox" checked={!!p.shelved} onChange={(e) => onShelved(p.id, e.target.checked)} />
          </label>
        );
      },
    },
  ], [owners, onOwner, onTrouble, onShelved, stagnantThreshold]);

  const table = useReactTable({
    data: filtered, columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const pageCount = table.getPageCount();
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, total);


  return (
    <section>
      <PartsListKpi kpi={kpi} filter={filter} stagnantThreshold={stagnantThreshold} onToggle={toggleFilter} />
      <PartsListToolbar
        filter={filter}
        query={query}
        cat={cat}
        owner={owner}
        kishu={kishu}
        showShelved={showShelved}
        shelvedCount={shelvedCount}
        cats={cats}
        ownerOpts={ownerOpts}
        kishus={kishus}
        admin={admin}
        onSetFilter={setFilter}
        onSetQuery={setQuery}
        onSetCat={setCat}
        onSetOwner={setOwner}
        onSetKishu={setKishu}
        onToggleShelved={() => setShowShelved((v) => !v)}
        onAutoAssign={onAutoAssign}
      />

      <div className="panel panel-loading-wrap">
        {pageBusy && <Loading variant="veil" label="読み込み中…" />}
        <div className="table-wrap">
          <table>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} className={h.column.getCanSort() ? 'sortable' : ''}
                      style={{ textAlign: 'center', ...(h.column.id === 'progress' ? { minWidth: 140 } : h.column.id === 'owner' ? { minWidth: 120 } : {}) }}
                      onClick={h.column.getToggleSortingHandler()}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {{ asc: ' ▲', desc: ' ▼' }[h.column.getIsSorted() as string] ?? ''}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={`row-${row.original.color}`} onClick={() => onOpen(row.original.id)}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}
                      style={['stag', 'due', 'owner', 'ownerDays', 'trouble', 'troubleDays', 'shelved'].includes(cell.column.id) ? { textAlign: 'center' } : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {total === 0 && (
                <tr><td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>該当なし</td></tr>
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
              <select className="filter" value={pageSize}
                disabled={pageBusy}
                onChange={(e) => {
                  const size = Number(e.target.value);
                  runTransition(() => setPagination((p) => ({ pageIndex: 0, pageSize: size })));
                }}>
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="pager-nav">
              <button type="button" className="chip" disabled={pageBusy || !table.getCanPreviousPage()}
                onClick={() => runTransition(() => table.previousPage())}>前へ</button>
              <span className="pager-page">{pageIndex + 1} / {pageCount}</span>
              <button type="button" className="chip" disabled={pageBusy || !table.getCanNextPage()}
                onClick={() => runTransition(() => table.nextPage())}>次へ</button>
            </div>
          </div>
        )}
      </div>

      {memoFor && (
        <MemoModal part={memoFor} onClose={() => setMemoFor(null)}
          onSave={(text) => { onMemo(memoFor.id, text); setMemoFor(null); }} />
      )}
    </section>
  );
}
