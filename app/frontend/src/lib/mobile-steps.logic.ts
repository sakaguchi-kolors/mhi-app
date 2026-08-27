// 部品詳細の工程リストの見せ方。
// 工程は30を超えることがあり、先頭の完了分をそのまま並べると
// 「いまどこにいるか」がスマホの画面外に押し出されるため、既定で畳む。
import type { CellStatus } from '../types';

/** これ以上あるときだけ完了工程を畳む（数件なら畳む方が手間） */
export const COLLAPSE_MIN_DONE = 3;

/** 先頭に連続する完了工程の数 */
export function countLeadingDone(steps: { status: CellStatus }[]): number {
  const first = steps.findIndex((s) => s.status !== 'done');
  return first === -1 ? steps.length : first;
}

/**
 * 既定で隠す先頭工程の数。
 * 全部完了なら最後の1つは残し、「終わった部品」であることが分かるようにする。
 */
export function hiddenLeadingDone(steps: { status: CellStatus }[]): number {
  const done = countLeadingDone(steps);
  if (done < COLLAPSE_MIN_DONE) return 0;
  return done === steps.length ? done - 1 : done;
}
