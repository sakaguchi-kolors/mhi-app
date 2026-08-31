import { useCallback, useEffect, useState } from 'react';
import type { IngestInfo, IngestSchedule } from '../../types';
import * as api from '../../api';
import type { ToastState } from '../Toast';

function fmtSlot(s: string | null | undefined): string {
  if (!s) return '—';
  return s.replace('T', ' ');
}

function toHm(v: string): string {
  const m = v.trim().match(/^(\d{1,2}):([0-5]\d)/);
  if (!m) return v;
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
}

function fmtTime(s: string | null | undefined): string {
  if (!s) return '—';
  return s.replace('T', ' ').slice(0, 19);
}

export function IngestSchedulePanel({
  info,
  toast,
  onSaved,
}: {
  info: IngestInfo | null;
  toast: ToastState;
  onSaved: (schedule: IngestSchedule) => void;
}) {
  const schedule = info?.schedule;
  const [enabled, setEnabled] = useState(false);
  const [times, setTimes] = useState<string[]>(['08:00', '13:00']);
  const [draftTime, setDraftTime] = useState('09:00');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!schedule) return;
    setEnabled(schedule.enabled);
    setTimes(schedule.times.length ? schedule.times : ['08:00', '13:00']);
  }, [schedule]);

  const persist = useCallback(
    async (nextEnabled: boolean, nextTimes: string[]) => {
      setSaving(true);
      try {
        const saved = await api.saveIngestSchedule({ enabled: nextEnabled, times: nextTimes });
        setEnabled(saved.enabled);
        setTimes(saved.times);
        onSaved(saved);
        toast.show(
          saved.enabled
            ? `自動取込を保存しました（${saved.times.join('・')}）`
            : '自動取込をオフにしました',
        );
      } catch (e) {
        console.error(e);
        toast.show(e instanceof Error ? e.message : '自動取込設定の保存に失敗しました');
      } finally {
        setSaving(false);
      }
    },
    [onSaved, toast],
  );

  const addTime = async () => {
    const hm = toHm(draftTime);
    if (!hm || times.includes(hm)) return;
    await persist(enabled, [...times, hm].sort());
  };

  const removeTime = async (hm: string) => {
    await persist(enabled, times.filter((t) => t !== hm));
  };

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 className="pt">自動取込</h3>
      <p className="mnote">
        指定フォルダの CSV を、日本時間の指定時刻に自動で取り込みます（Windows タスクスケジューラは不要）。
        ファイルが揃っていない時刻はスキップし、手動の「取込実行」もそのまま使えます。
      </p>
      <div className="ingest-schedule">
        <label className="ingest-schedule-toggle">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving || !schedule}
            onChange={(e) => { void persist(e.target.checked, times); }}
          />
          自動取込を有効にする
        </label>
        <div className="ingest-schedule-times">
          {times.map((hm) => (
            <span key={hm} className="ingest-time-chip">
              {hm}
              <button
                type="button"
                className="ingest-time-remove"
                disabled={saving || (enabled && times.length <= 1)}
                onClick={() => void removeTime(hm)}
                aria-label={`${hm} を削除`}
              >
                ×
              </button>
            </span>
          ))}
          <span className="ingest-time-add">
            <input
              type="time"
              value={draftTime}
              disabled={saving}
              onChange={(e) => setDraftTime(e.target.value)}
            />
            <button type="button" className="chip" disabled={saving || !draftTime || times.includes(toHm(draftTime))} onClick={() => void addTime()}>
              ＋時刻追加
            </button>
          </span>
        </div>
        <p className="mnote" style={{ marginTop: 8 }}>
          タイムゾーン {schedule?.timezone ?? 'Asia/Tokyo'}
          {' ／ '}次回 {enabled ? fmtSlot(schedule?.nextRunAt) : '—'}
          {' ／ '}最終自動取込 {fmtTime(schedule?.lastTriggeredAt)}
        </p>
      </div>
    </div>
  );
}
