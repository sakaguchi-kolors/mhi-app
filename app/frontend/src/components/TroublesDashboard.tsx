import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel, flexRender,
  type ColumnDef, type SortingState, type PaginationState,
} from '@tanstack/react-table';
import type { Part } from '../types';
import { jc } from '../util';

const PAGE_SIZES = [30, 50, 100] as const;

function facetOptions(arr: string[], sel: string): string[] {
  const s = [...new Set(arr)].sort();
  return sel !== 'all' && !s.includes(sel) ? [...s, sel] : s;
}

function troubleUrgency(days: number | null | undefined): 'fresh' | 'watch' | 'critical' {
  const d = days ?? 0;
  if (d >= 7) return 'critical';
  if (d >= 3) return 'watch';
  return 'fresh';
}

function troubleUrgencyLabel(days: number | null | undefined): string {
  const u = troubleUrgency(days);
  if (u === 'critical') return '7日以上';
  if (u === 'watch') return '3〜6日';
  return '0〜2日';
}

type DurationFilter = 'all' | 'fresh' | 'watch' | 'critical';
type ChipFilter = 'all' | 'nomemo' | 'unassigned' | DurationFilter;

interface Props {
  parts: Part[];
  owners: string[];
  defaultOwnerFilter?: string;
  onOpen: (id: string) => void;
  onTrouble: (id: string, flagged: boolean) => void;
  onMemo: (id: string, memo: string) => void;
}

export function TroublesDashboard({ parts, owners, defaultOwnerFilter, onOpen, onTrouble, onMemo }: Props) {
  const troubles = useMemo(() => parts.filter((p) => p.trouble), [parts]);

  const [filter, setFilter] = useState<ChipFilter>('all');
  const [cat, setCat] = useState('all');
  const [owner, setOwner] = useState(defaultOwnerFilter ?? 'all');
  const [kishu, setKishu] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'troubleDays', desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 30 });
  const [memoFor, setMemoFor] = useState<Part | null>(null);

  const toggleFilter = (next: ChipFilter) => setFilter((cur) => (cur === next ? 'all' : next));

  const matchDuration = (p: Part, dur: DurationFilter) => {
    if (dur === 'all') return true;
    return troubleUrgency(p.troubleDays) === dur;
  };

  const match = useCallback((p: Part, except: 'cat' | 'kishu' | 'owner' | 'chip' | null) => {
    if (except !== 'cat' && cat !== 'all' && p.category !== cat) return false;
    if (except !== 'kishu' && kishu !== 'all' && p.kishu !== kishu) return false;
    if (except !== 'owner' && owner !== 'all' && (p.owner ?? '未割当') !== owner) return false;
    if (except !== 'chip') {
      if (filter === 'nomemo' && (p.memo ?? '').trim()) return false;
      if (filter === 'unassigned' && (p.owner ?? '未割当') !== '未割当') return false;
      if (['fresh', 'watch', 'critical'].includes(filter) && !matchDuration(p, filter as DurationFilter)) return false;
    }
    return true;
  }, [cat, kishu, owner, filter]);

  const filtered = useMemo(() => troubles.filter((p) => match(p, null)), [troubles, match]);

  useEffect(() => { setPagination((p) => ({ ...p, pageIndex: 0 })); }, [filter, cat, owner, kishu]);

  const cats = useMemo(() => facetOptions(troubles.filter((p) => match(p, 'cat')).map((p) => p.category), cat), [troubles, match, cat]);
  const kishus = useMemo(() => facetOptions(troubles.filter((p) => match(p, 'kishu')).map((p) => p.kishu).filter(Boolean), kishu), [troubles, match, kishu]);
  const ownerOpts = useMemo(() => facetOptions(troubles.filter((p) => match(p, 'owner')).map((p) => p.owner ?? '未割当'), owner), [troubles, match, owner]);

  const kpi = useMemo(() => {
    const f = troubles.filter((p) => match(p, 'chip'));
    const cnt = (pred: (p: Part) => boolean) => f.filter(pred).length;
    const un = (p: Part) => (p.owner ?? '未割当') === '未割当';
    return {
      total: f.length,
      critical: cnt((p) => troubleUrgency(p.troubleDays) === 'critical'),
      nomemo: cnt((p) => !(p.memo ?? '').trim()),
      unassigned: cnt(un),
    };
  }, [troubles, match]);

  const columns = useMemo<ColumnDef<Part>[]>(() => [
    {
      id: 'troubleDays', header: '経過', accessorFn: (p) => p.troubleDays ?? -1,
      sortingFn: (a, b) => (b.original.troubleDays ?? -1) - (a.original.troubleDays ?? -1),
      cell: ({ row }) => {
        const p = row.original;
        const u = troubleUrgency(p.troubleDays);
        return (
          <div className={`trouble-age ${u}`}>
            <div className="trouble-age-num">{p.troubleDays ?? 0}<span className="u">日</span></div>
            <div className="trouble-age-lbl">{troubleUrgencyLabel(p.troubleDays)}</div>
          </div>
        );
      },
    },
    {
      id: 'name', header: '部品', accessorFn: (p) => p.name,
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name),
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div>
            <div className="pname">{p.name}</div>
            <div className="pno">{p.partNo} <span style={{ opacity: 0.7 }}>#{p.inst}</span></div>
            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <span className="cat-tag">{p.category}</span>
              {p.kishu && <span className="cat-tag" style={{ background: '#f4f6fa', color: 'var(--muted)' }}>{p.kishu}</span>}
            </div>
          </div>
        );
      },
    },
    {
      id: 'memo', header: '困りごと内容', enableSorting: false,
      cell: ({ row }) => {
        const p = row.original;
        const text = (p.memo ?? '').trim();
        return (
          <div className="trouble-memo-cell" onClick={(e) => e.stopPropagation()}>
            {text ? (
              <p className="trouble-memo-text" title={text}>{text}</p>
            ) : (
              <p className="trouble-memo-empty">メモ未入力 — 内容を記録してください</p>
            )}
            <button
              type="button"
              className={`memo-btn ${text ? 'has' : ''}`}
              onClick={() => setMemoFor(p)}
            >
              📝 {text ? '編集' : '追加'}
            </button>
          </div>
        );
      },
    },
    {
      id: 'sev', header: '納期状態', accessorFn: (p) => p.color,
      cell: ({ row }) => {
        const p = row.original;
        return <span className={`state-pill ${p.color}`}>{jc(p.color)}　{p.buffer >= 0 ? '+' : ''}{p.buffer}日</span>;
      },
    },
    {
      id: 'owner', header: '担当者', enableSorting: false,
      cell: ({ row }) => {
        const p = row.original;
        const cur = p.owner ?? '未割当';
        return <span className={cur === '未割当' ? 'od none' : 'od'}>{cur}</span>;
      },
    },
    {
      id: 'actions', header: '操作', enableSorting: false,
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="trouble-actions" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="chip trouble-resolve" onClick={() => {
              if (confirm('この困りごとを解決済みにしますか？')) onTrouble(p.id, false);
            }}>
              ✓ 解決
            </button>
          </div>
        );
      },
    },
  ], [onTrouble]);

  const table = useReactTable({
    data: filtered, columns,
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
          <div className="trouble-empty-icon" aria-hidden>✓</div>
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
          <h2 className="trouble-intro-title">現在 <b>{troubles.length}</b> 件の困りごと</h2>
          <p className="trouble-intro-sub">経過日数が長いものほど優先的に確認してください。行をクリックすると部品詳細へ移動します。</p>
        </div>
      </div>

      <div className="kpi-row trouble-kpi">
        <button type="button" className={`kpi trouble ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')} title="すべての困りごと">
          <div className="num">{kpi.total}</div>
          <div className="lbl">⚠ 困りごと合計</div>
        </button>
        <button type="button" className={`kpi trouble-critical ${filter === 'critical' ? 'active' : ''}`}
          onClick={() => toggleFilter('critical')} title="7日以上経過">
          <div className="num">{kpi.critical}</div>
          <div className="lbl">🔴 7日以上（要対応）</div>
        </button>
        <button type="button" className={`kpi trouble-nomemo ${filter === 'nomemo' ? 'active' : ''}`}
          onClick={() => toggleFilter('nomemo')} title="メモ未入力">
          <div className="num">{kpi.nomemo}</div>
          <div className="lbl">📝 メモ未入力</div>
        </button>
        <button type="button" className={`kpi trouble-unassigned ${filter === 'unassigned' ? 'active' : ''}`}
          onClick={() => toggleFilter('unassigned')} title="担当者未割当">
          <div className="num">{kpi.unassigned}</div>
          <div className="lbl">👤 担当未割当</div>
        </button>
      </div>

      <div className="toolbar">
        <span className={`chip ${filter === 'fresh' ? 'active' : ''}`} onClick={() => toggleFilter('fresh')}>0〜2日</span>
        <span className={`chip ${filter === 'watch' ? 'active' : ''}`} onClick={() => toggleFilter('watch')}>3〜6日</span>
        <span className={`chip ${filter === 'critical' ? 'active' : ''}`} onClick={() => toggleFilter('critical')}>7日以上</span>
        <select className="filter" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">完成品分類：すべて</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="filter" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="all">担当者：すべて</option>
          {ownerOpts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="filter" value={kishu} onChange={(e) => setKishu(e.target.value)}>
          <option value="all">機種：すべて</option>
          {kishus.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="trouble-table">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} className={h.column.getCanSort() ? 'sortable' : ''}
                      style={{ textAlign: h.column.id === 'name' || h.column.id === 'memo' ? 'left' : 'center' }}
                      onClick={h.column.getToggleSortingHandler()}>
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
                      <td key={cell.id}
                        style={{ textAlign: ['troubleDays', 'sev', 'owner', 'actions'].includes(cell.column.id) ? 'center' : 'left' }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {total === 0 && (
                <tr><td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>フィルタ条件に該当する困りごとはありません</td></tr>
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
                onChange={(e) => table.setPageSize(Number(e.target.value))}>
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="pager-nav">
              <button type="button" className="chip" disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}>前へ</button>
              <span className="pager-page">{pageIndex + 1} / {pageCount}</span>
              <button type="button" className="chip" disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}>次へ</button>
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

function MemoModal({ part, onClose, onSave }: { part: Part; onClose: () => void; onSave: (t: string) => void }) {
  const [text, setText] = useState(part.memo ?? '');
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>困りごとメモ</h3>
        <p className="msub">{part.name}（{part.partNo}）</p>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="困っている内容・経緯・依頼先などを記入…" />
        <div className="modal-btns">
          <button className="cancel" onClick={onClose}>キャンセル</button>
          <button className="save" onClick={() => onSave(text)}>保存</button>
        </div>
      </div>
    </div>
  );
}
