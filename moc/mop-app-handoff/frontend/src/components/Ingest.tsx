import { useCallback, useEffect, useRef, useState } from 'react';
import type { IngestInfo } from '../types';
import * as api from '../api';
import type { ToastState } from './Toast';

const MB = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const fmtTime = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 19) : '—');

export function Ingest({ toast, onIngested }: { toast: ToastState; onIngested: () => Promise<void> }) {
  const [info, setInfo] = useState<IngestInfo | null>(null);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const prevState = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await api.getIngest());
    } catch (e) {
      console.error(e);
      toast.show('取込情報の取得に失敗しました');
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const running = info?.job?.state === 'running';

  // 実行中は2秒ごとにポーリング＋経過時間を更新
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { setNow(Date.now()); load(); }, 2000);
    return () => clearInterval(t);
  }, [running, load]);

  // running -> done/error への遷移でトースト＆一覧リロード
  useEffect(() => {
    const st = info?.job?.state ?? null;
    if (prevState.current === 'running' && st !== 'running') {
      if (st === 'done') {
        const r = info?.job?.result;
        toast.show(r ? `取込完了：${r.parts}部品を更新` : '取込完了');
        onIngested().catch(() => {});
      } else if (st === 'error') {
        toast.show('取込に失敗しました');
      }
    }
    prevState.current = st;
  }, [info, toast, onIngested]);

  const start = async () => {
    if (!confirm('指定フォルダのデータを取り込みます。既存の取込データは洗い替えられます（担当者・困りごと・メモは温存）。実行しますか？')) return;
    setStarting(true);
    try {
      const r = await api.runIngest();
      if (r.status === 409) toast.show('別の取込が実行中です');
      else if (r.status === 422) toast.show('取込前チェックでエラーがあります（下表を確認）');
      else if (r.started) { toast.show('取込を開始しました'); prevState.current = 'running'; }
      await load();
    } catch (e) {
      console.error(e);
      toast.show('取込の開始に失敗しました');
    } finally {
      setStarting(false);
    }
  };

  const job = info?.job ?? null;
  const elapsedSec = job
    ? job.state === 'running'
      ? Math.max(0, Math.round((now - Date.parse(job.startedAt)) / 1000))
      : job.elapsedMs != null ? Math.round(job.elapsedMs / 1000) : null
    : null;

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>データ取込</h2>
          <p>指定フォルダのCSVを取り込みます（本番は同じ処理をタスクスケジューラで定期実行）。取込は洗い替えで、担当者・困りごと・メモは温存されます。</p>
        </div>
        <button className="back-btn" onClick={start} disabled={starting || running || !info?.preflightOk}>
          {running ? '取込中…' : starting ? '開始中…' : '⬇ 取込実行'}
        </button>
      </div>

      <div className="panel">
        <p className="mnote">対象フォルダ：<code>{info?.dir ?? '—'}</code></p>
        <div className="table-wrap">
          <table className="mtable">
            <thead>
              <tr><th>ファイル</th><th>状態</th><th>サイズ</th><th>更新日時</th><th>文字コード</th><th>ヘッダ検証</th></tr>
            </thead>
            <tbody>
              {(info?.files ?? []).map((f) => (
                <tr key={f.name}>
                  <td>{f.name}</td>
                  <td style={{ color: f.exists ? 'var(--green)' : 'var(--red)' }}>{f.exists ? '✓ あり' : '✗ なし'}</td>
                  <td>{f.exists ? MB(f.size) : '—'}</td>
                  <td>{f.exists ? fmtTime(f.mtime) : '—'}</td>
                  <td>{f.encoding ?? '—'}</td>
                  <td style={{ color: f.requiredOk && !f.error ? 'var(--green)' : 'var(--red)' }}>
                    {f.error ? `エラー: ${f.error}` : f.requiredOk ? 'OK' : `不足列: ${f.missing.join(', ')}`}
                  </td>
                </tr>
              ))}
              {(!info || info.files.length === 0) && <tr><td colSpan={6} style={{ padding: 12 }}>読み込み中…</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mnote" style={{ marginTop: 8, color: info?.preflightOk ? 'var(--green)' : 'var(--red)' }}>
          {info ? (info.preflightOk ? '取込前チェック: OK（実行できます）' : '取込前チェック: NG（不足・エラーを解消してください）') : ''}
        </p>
      </div>

      {job && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3 className="pt">取込ジョブ</h3>
          {job.state === 'running' && <p>⏳ 取込中… 経過 {elapsedSec}秒（実データは約2分かかります）</p>}
          {job.state === 'done' && job.result && (
            <p>
              ✅ 完了（{elapsedSec}秒）：<b>{job.result.parts}</b>部品 / タイムライン{job.result.timeline}件{' ｜ '}
              <span style={{ color: 'var(--red)' }}>赤 {job.result.colors.red}</span>{' '}
              <span style={{ color: 'var(--yellow)' }}>黄 {job.result.colors.yellow}</span>{' '}
              <span style={{ color: 'var(--green)' }}>緑 {job.result.colors.green}</span>
            </p>
          )}
          {job.state === 'error' && <p style={{ color: 'var(--red)' }}>❌ 失敗：{job.error}</p>}
          <p className="mnote">実行者 {job.user} ／ 開始 {fmtTime(job.startedAt)}{job.finishedAt ? ` ／ 終了 ${fmtTime(job.finishedAt)}` : ''}</p>
        </div>
      )}
    </section>
  );
}
