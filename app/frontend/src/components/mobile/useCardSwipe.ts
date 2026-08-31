import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  SWIPE_AXIS_LOCK_PX,
  clampSwipeDx,
  decideSwipeAxis,
  swipeIntent,
  type SwipeAxis,
  type SwipeIntent,
} from '../../lib/mobile-swipe.logic';

type Opts = {
  onCheck: () => void;
  onTrouble: () => void;
};

/**
 * カード本体の Pointer Events。ボタン上では開始しない。
 * 縦方向にロックしたら以降は無視し、リストのスクロールに任せる。
 */
export function useCardSwipe({ onCheck, onTrouble }: Opts) {
  const [dx, setDx] = useState(0);
  const axis = useRef<SwipeAxis>('undecided');
  const start = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  const dragging = useRef(false);

  const reset = useCallback(() => {
    axis.current = 'undecided';
    dragging.current = false;
    setDx(0);
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button.m-act, button.m-sheet-btn, a')) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = 'undecided';
    moved.current = false;
    dragging.current = true;
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!dragging.current) return;
    const rawX = e.clientX - start.current.x;
    const rawY = e.clientY - start.current.y;
    if (axis.current === 'undecided') {
      axis.current = decideSwipeAxis(rawX, rawY, SWIPE_AXIS_LOCK_PX);
      if (axis.current === 'undecided') return;
      if (axis.current === 'y') return;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (axis.current !== 'x') return;
    e.preventDefault();
    if (Math.abs(rawX) > 8) moved.current = true;
    setDx(clampSwipeDx(rawX));
  }, []);

  const finish = useCallback((currentDx: number) => {
    const intent: SwipeIntent = swipeIntent(currentDx);
    reset();
    if (intent === 'check') onCheck();
    else if (intent === 'trouble') onTrouble();
  }, [onCheck, onTrouble, reset]);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!dragging.current) return;
    const rawX = e.clientX - start.current.x;
    const wasX = axis.current === 'x';
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (wasX) finish(rawX);
    else reset();
  }, [finish, reset]);

  const onPointerCancel = useCallback(() => {
    reset();
  }, [reset]);

  /** スワイプ後に tap が誤発火しないようにする */
  const suppressClick = useCallback((e: React.MouseEvent) => {
    if (!moved.current) return;
    e.preventDefault();
    e.stopPropagation();
    moved.current = false;
  }, []);

  return {
    dx,
    dragging: dx !== 0,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    suppressClick,
  };
}
