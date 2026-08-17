import type { AdjustSupport } from '../types';

export function formatDays(n: number): string {
  return `${n}日`;
}

/** 差分列：+0.5日 / -2日 / 0日 */
export function signedDiff(n: number): string {
  if (n === 0) return '0日';
  return n > 0 ? `+${n}日` : `${n}日`;
}

export function formatHs(hours: number | null): string {
  if (hours == null) return '—';
  return `${hours}h`;
}

export type DiffTone = 'gain' | 'loss' | 'flat';

/** マイナス＝前倒し余地（緑）、プラス＝Hsのほうが長い（赤） */
export function diffTone(n: number): DiffTone {
  if (n < 0) return 'gain';
  if (n > 0) return 'loss';
  return 'flat';
}

export function delayTone(n: number): 'late' | 'ok' {
  return n > 0 ? 'late' : 'ok';
}

export function postRecoverySub(data: AdjustSupport): string {
  const d = data.postRecoveryDelayDays;
  if (d > 0) return `最終納期 +${d}日`;
  if (d < 0) return `最終納期 ${d}日`;
  return '最終納期どおり';
}
