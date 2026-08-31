// 受信箱カードの左右スワイプ判定。
// 縦スクロールを奪わないよう、最初の動きで軸をロックする。

export const SWIPE_COMMIT_PX = 80;
export const SWIPE_AXIS_LOCK_PX = 12;
export const SWIPE_MAX_PX = 120;

export type SwipeAxis = 'undecided' | 'x' | 'y';
export type SwipeIntent = 'none' | 'check' | 'trouble';

/** 最初に一定距離動いた方向を軸にする。縦が先ならスクロールに譲る */
export function decideSwipeAxis(dx: number, dy: number, lockPx = SWIPE_AXIS_LOCK_PX): SwipeAxis {
  if (Math.abs(dx) < lockPx && Math.abs(dy) < lockPx) return 'undecided';
  return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
}

/** 離したときの確定。右＝確認済み、左＝困りごと。閾値未満はキャンセル */
export function swipeIntent(dx: number, commitPx = SWIPE_COMMIT_PX): SwipeIntent {
  if (dx >= commitPx) return 'check';
  if (dx <= -commitPx) return 'trouble';
  return 'none';
}

export function clampSwipeDx(dx: number, maxPx = SWIPE_MAX_PX): number {
  return Math.max(-maxPx, Math.min(maxPx, dx));
}
