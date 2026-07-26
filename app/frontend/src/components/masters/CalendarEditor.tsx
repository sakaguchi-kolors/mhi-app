import { useMemo, useState } from 'react';
import type { Row } from './shared';
import { str } from './shared';

type Props = {
  rows: Row[];
  onSave: (row: Row, isNew: boolean) => Promise<void>;
  onDelete: (date: unknown) => Promise<void>;
};

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function CalendarEditor({ rows, onSave, onDelete }: Props) {
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

  return (
    <div className="master-forms">
      <div className="master-card">
        <h4>稼働日カレンダー（休日の登録）</h4>
        <p className="mnote">
          日付をクリックして休日にします。休日は残日数計算から除外されます。未登録の日は暦日どおりです（登録休日: {holidayCount}日）。
        </p>
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
            const isOddWork = row && !isHoliday;
            return (
              <button
                key={iso}
                type="button"
                className={`cal-cell ${isHoliday ? 'holiday' : ''} ${isOddWork ? 'work-reg' : ''} ${busy === iso ? 'busy' : ''}`}
                onClick={() => toggle(iso)}
                title={isHoliday ? 'クリックで休日解除' : 'クリックで休日にする'}
              >
                <span className="cal-day">{cell.getDate()}</span>
                {isHoliday && <span className="cal-tag">休</span>}
                {isOddWork && <span className="cal-tag muted">登</span>}
              </button>
            );
          })}
        </div>
        <p className="mnote" style={{ marginBottom: 0 }}>
          「休」= 休日（残日数から除外）／「登」= 稼働日として登録済み（効果はほぼありません）
        </p>
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
