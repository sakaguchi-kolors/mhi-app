import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import type { Part } from '../types';
import { sevRank, jc } from '../util';
import { ProgressBar } from './ProgressBar';

// 一意化＋ソート。選択中の値(sel)は他フィルタで消えても選べるよう必ず含める
function facetOptions(arr: string[], sel: string): string[] {
  const s = [...new Set(arr)].sort();
  return sel !== 'all' && !s.includes(sel) ? [...s, sel] : s;
}

interface Props {
  parts: Part[];
  owners: string[];
  admin?: boolean;
  onAutoAssign?: () => void;
  onOpen: (id: string) => void;
  onOwner: (id: string, owner: string) => void;
  onTrouble: (id: string, flagged: boolean) => void;
  onMemo: (id: string, memo: string) => void;
}

export function PartsList({ parts, owners, admin, onAutoAssign, onOpen, onOwner, onTrouble, onMemo }: Props) {
  const [filter, setFilter] = useState<'all' | 'risk' | 'stag'>('all');
  const [cat, setCat] = useState('all');
  const [owner, setOwner] = useState('all');
  // 機種スコープは担当ごとに固定的なので localStorage に保持
  const [kishu, setKishu] = useState(() => localStorage.getItem('mop_kishu') ?? 'all');
  const [showAll, setShowAll] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'sev', desc: false }]);
  const [memoFor, setMemoFor] = useState<Part | null>(null);

  useEffect(() => { localStorage.setItem('mop_kishu', kishu); }, [kishu]);

  // 各フィルタを適用（except で指定した1軸だけ無視）。連動フィルタの選択肢算出にも使う
  const match = useCallback((p: Part, except: 'cat' | 'kishu' | 'owner' | 'chip' | null) => {
    if (except !== 'cat' && cat !== 'all' && p.category !== cat) return false;
    if (except !== 'kishu' && kishu !== 'all' && p.kishu !== kishu) return false;
    if (except !== 'owner' && owner !== 'all' && (p.owner ?? '未割当') !== owner) return false;
    if (except !== 'chip') {
      if (filter === 'risk' && p.color === 'green') return false;
      if (filter === 'stag' && p.stagnant < 10) return false;
    }
    return true;
  }, [cat, kishu, owner, filter]);

  const filtered = useMemo(() => parts.filter((p) => match(p, null)), [parts, match]);

  // ドロップダウンの選択肢は「その軸以外のフィルタ適用後」の部品から動的生成（連動フィルタ）
  const cats = useMemo(() => facetOptions(parts.filter((p) => match(p, 'cat')).map((p) => p.category), cat), [parts, match, cat]);
  const kishus = useMemo(() => facetOptions(parts.filter((p) => match(p, 'kishu')).map((p) => p.kishu).filter(Boolean), kishu), [parts, match, kishu]);
  const ownerOpts = useMemo(() => facetOptions(parts.filter((p) => match(p, 'owner')).map((p) => p.owner ?? '未割当'), owner), [parts, match, owner]);

  // 大量（例: 全機種2万件）を一括描画するとブラウザが固まるため、既定では抑止して絞り込みを促す
  const CAP = 1000;
  const tooMany = filtered.length > CAP && !showAll;

  const kpi = useMemo(() => {
    const f = filtered;
    const cnt = (pred: (p: Part) => boolean) => f.filter(pred).length;
    const un = (p: Part) => (p.owner ?? '未割当') === '未割当';
    return {
      r: cnt((p) => p.color === 'red'), y: cnt((p) => p.color === 'yellow'),
      g: cnt((p) => p.color === 'green'), s: cnt((p) => p.stagnant >= 10),
      ru: cnt((p) => p.color === 'red' && un(p)), yu: cnt((p) => p.color === 'yellow' && un(p)),
      su: cnt((p) => p.stagnant >= 10 && un(p)),
    };
  }, [filtered]);

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
          </div>
        );
      },
    },
    { id: 'progress', header: '進捗（Shop工程）', enableSorting: false, cell: ({ row }) => <ProgressBar p={row.original} /> },
    {
      id: 'stag', header: '滞留状況', accessorFn: (p) => p.stagnant, sortingFn: (a, b) => b.original.stagnant - a.original.stagnant,
      cell: ({ row }) => {
        const p = row.original; const flag = p.stagnant >= 10;
        // セルの `flag` クラスがバッジ用 .flag{display:inline-block} と衝突するため、縦並びを明示
        return (
          <div className={`stag-cell ${flag ? 'flag' : 'ok'}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span className="stag-days">{p.stagnant}<span className="u">日</span></span>
            {flag ? <span className="flag stag">🚩10日超</span> : <span className="stag-ok">問題なし</span>}
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
        return (
          <div className="own-wrap">
            <select className={`own-sel ${cur === '未割当' ? 'unassigned' : ''}`} value={cur}
              onClick={(e) => e.stopPropagation()} onChange={(e) => onOwner(p.id, e.target.value)}>
              {owners.map((o) => <option key={o} value={o}>{o}</option>)}
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
  ], [owners, onOwner, onTrouble]);

  const table = useReactTable({
    data: filtered, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  const sub = (nn: number, tot: number) => (tot > 0 ? <div className="kpi-sub">未割当 <b>{nn}</b></div> : null);

  return (
    <section>
      <div className="kpi-row">
        <div className="kpi red"><div className="num">{kpi.r}</div><div className="lbl">🔴 納期危険（要対応）</div>{sub(kpi.ru, kpi.r)}</div>
        <div className="kpi yellow"><div className="num">{kpi.y}</div><div className="lbl">🟡 ギリギリ（要注視）</div>{sub(kpi.yu, kpi.y)}</div>
        <div className="kpi green"><div className="num">{kpi.g}</div><div className="lbl">🟢 余裕あり</div></div>
        <div className="kpi flag"><div className="num">{kpi.s}</div><div className="lbl">🚩 滞留10日以上</div>{sub(kpi.su, kpi.s)}</div>
      </div>

      <div className="toolbar">
        <span className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>すべて</span>
        <span className={`chip ${filter === 'risk' ? 'active' : ''}`} onClick={() => setFilter('risk')}>要注意（赤・黄）</span>
        <span className={`chip ${filter === 'stag' ? 'active' : ''}`} onClick={() => setFilter('stag')}>滞留🚩のみ</span>
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
        {admin && onAutoAssign && (
          <button className="chip assign-btn" onClick={onAutoAssign}
            title="未割当の部品を機種→担当チームに基づいて自動割り当て（既存の割当は変更しません）">
            ⚙ 未割当を自動割り当て
          </button>
        )}
      </div>

      {tooMany ? (
        <div className="panel" style={{ textAlign: 'center', padding: 30 }}>
          <p style={{ margin: 0 }}>該当 <b>{filtered.length.toLocaleString()}</b> 件。表示が重くなるため、上の<b>機種</b>・担当チーム・完成品分類・担当者で絞り込んでください。</p>
          <button className="chip" style={{ marginTop: 12 }} onClick={() => setShowAll(true)}>それでも全件表示する（重い）</button>
        </div>
      ) : (
      <div className="panel">
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
                      style={['stag', 'due', 'owner', 'ownerDays', 'trouble', 'troubleDays'].includes(cell.column.id) ? { textAlign: 'center' } : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>該当なし</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

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
        <h3>メモ</h3>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="困っている内容・経緯・依頼先などを記入…" />
        <div className="modal-btns">
          <button className="cancel" onClick={onClose}>キャンセル</button>
          <button className="save" onClick={() => onSave(text)}>保存</button>
        </div>
      </div>
    </div>
  );
}
