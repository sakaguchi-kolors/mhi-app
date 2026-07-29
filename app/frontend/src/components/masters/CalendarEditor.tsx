import { useMemo, useState } from 'react';
import type { Part } from '../../types';
import type { Row } from './shared';
import { str } from './shared';
import { UpdatedMeta } from './RowHistory';

type Props = {
  rows: Row[];
  parts: Part[];
  onSave: (row: Row, isNew: boolean) => Promise<boolean>;
  onDelete: (date: unknown) => Promise<boolean>;
};

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function CalendarEditor({ rows, parts, onSave, onDelete }: Props) {
  const holidayMap = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows) {
      const key = str(r.cal_date).slice(0, 10);
      // 休日登録が本質。稼働日=true の行は実質ノー効果なので休日扱いの行だけ強調
      m.set(key, r);
    }
    return m;
  }, [rows]);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [busy, setBusy] = useState<string | null>(null);

  const weeks = useMemo(() => buildMonth(year, month), [year, month]);

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const toggle = async (iso: string) => {
    if (busy) return;
    setBusy(iso);
    try {
      const existing = holidayMap.get(iso);
      if (existing && (existing.is_workday === false || existing.is_workday === 'false')) {
        await onDelete(existing.cal_date ?? iso);
      } else if (existing) {
        // 稼働日として登録されている行 → 休日に更新
        await onSave({ ...existing, is_workday: false, note: str(existing.note) || '休日' }, false);
      } else {
        await onSave({ cal_date: iso, is_workday: false, note: '休日' }, true);
      }
    } finally {
      setBusy(null);
    }
  };

  const holidayCount = [...holidayMap.values()].filter(
    (r) => r.is_workday === false || r.is_workday === 'false',
  ).length;

  const holidays = useMemo(
    () =>
      [...holidayMap.values()]
        .filter((r) => r.is_workday === false || r.is_workday === 'false')
        .sort((a, b) => str(a.cal_date).localeCompare(str(b.cal_date))),
    [holidayMap],
  );

  const tightBuffer = useMemo(() => parts.filter((p) => p.buffer <= 2).length, [parts]);

  return (
    <div className="master-forms">
      <div className="master-card">
        <h4>稼働日カレンダー（休日の登録）</h4>
        <p className="mnote">
          日付をクリックして休日にします。休日は残日数計算から除外されます。未登録の日は暦日どおりです（登録休日: {holidayCount}日）。
        </p>
        <p className="param-effect">変更すると：残日数・バッファ（余裕日数）→ 一覧の緊急度色が変わります。</p>
        <div className="param-preview">
          <div className="param-preview-title">影響の目安（現在の部品データ）</div>
          <div className="param-preview-row">
            <span>登録休日</span>
            <span className="pill yellow">{holidayCount} 日</span>
          </div>
          <div className="param-preview-row">
            <span>バッファ2日以下の部品（休日追加で色が変わりやすい）</span>
            <span className="pill red">{tightBuffer} 件</span>
          </div>
          <p className="mnote" style={{ marginBottom: 0 }}>
            休日の追加・解除は保存後すぐ一覧に反映されます。
          </p>
        </div>
        <div className="cal-nav">
          <button type="button" className="mbtn" onClick={() => shift(-1)}>
            ← 前月
          </button>
          <strong>
            {year}年 {month + 1}月
          </strong>
          <button type="button" className="mbtn" onClick={() => shift(1)}>
            翌月 →
          </button>
        </div>
        <div className="cal-grid">
          {['日', '月', '火', '水', '木', '金', '土'].map((w) => (
            <div key={w} className="cal-dow">
              {w}
            </div>
          ))}
          {weeks.flat().map((cell, i) => {
            if (!cell) return <div key={`e${i}`} className="cal-cell empty" />;
            const iso = ymd(cell);
            const row = holidayMap.get(iso);
            const isHoliday = row && (row.is_workday === false || row.is_workday === 'false');
            return (
              <button
                key={iso}
                type="button"
                className={`cal-cell ${isHoliday ? 'holiday' : ''} ${busy === iso ? 'busy' : ''}`}
                onClick={() => toggle(iso)}
                title={isHoliday ? 'クリックで休日解除' : 'クリックで休日にする'}
              >
                <span className="cal-day">{cell.getDate()}</span>
                {isHoliday && <span className="cal-tag">休</span>}
              </button>
            );
          })}
        </div>
        {holidays.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="mtable">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>摘要</th>
                  <th>最終更新</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((row) => {
                  const iso = str(row.cal_date).slice(0, 10);
                  return (
                    <tr key={iso}>
                      <td>{iso}</td>
                      <td>{str(row.note) || '休日'}</td>
                      <td>
                        <UpdatedMeta row={row} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function buildMonth(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
