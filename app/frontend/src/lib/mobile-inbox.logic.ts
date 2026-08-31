// スマホ受信箱（/m）の並び・絞り込みロジック。
// 画面から切り離した純関数にして、テストで仕様を固定する。
import type { Part } from '../types';
import { sevRank } from '../util';

/** 上部タブ。メールアプリの「すべて／未読／フラグ付き」に相当する3択 */
export type InboxTab = 'all' | 'action' | 'trouble';

export type InboxState = {
  tab: InboxTab;
  query: string;
  owner: string;
  kishu: string;
  stagnantThreshold: number;
  /** 端末内で「今日は確認した」と記録済みの OS_ID */
  checkedIds: ReadonlySet<string>;
  /** 確認済みを一覧に残すか（既定は false ＝ 受信箱から消す） */
  showChecked: boolean;
};

export const INBOX_TAB_LABELS: Record<InboxTab, string> = {
  all: 'すべて',
  action: '要対応',
  trouble: '困りごと',
};

/** 実機で全件カードを載せるとメモリ不足でタブが落ちるので、最初はこれだけ出す */
export const INBOX_PAGE_SIZE = 40;

export function sliceInboxPage(list: Part[], visible: number): Part[] {
  if (visible >= list.length) return list;
  return list.slice(0, visible);
}

/** 部品番号・OS_ID・名称・機種を対象にした部分一致 */
export function matchesInboxQuery(p: Part, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${p.name} ${p.partNo} ${p.id} ${p.kishu}`.toLowerCase().includes(q);
}

/** 滞留がしきい値以上か（🚩の判定） */
export function isStagnant(p: Part, stagnantThreshold: number): boolean {
  return p.stagnant >= stagnantThreshold;
}

/**
 * 要対応＝赤・黄、または滞留🚩。
 * 「今日中に手を打つべきか」を1つの条件に寄せ、スマホでの判断を1タップで済ませる。
 */
export function isActionNeeded(p: Part, stagnantThreshold: number): boolean {
  return p.color !== 'green' || isStagnant(p, stagnantThreshold);
}

export function matchInboxFilter(p: Part, state: InboxState): boolean {
  const { tab, query, owner, kishu, stagnantThreshold, checkedIds, showChecked } = state;
  // 保留（無期限）は PC 側の運用と同じく受信箱から外す
  if (p.shelved) return false;
  if (!showChecked && checkedIds.has(p.id)) return false;
  if (!matchesInboxQuery(p, query)) return false;
  if (owner !== 'all' && (p.owner ?? '未割当') !== owner) return false;
  if (kishu !== 'all' && p.kishu !== kishu) return false;
  if (tab === 'action' && !isActionNeeded(p, stagnantThreshold)) return false;
  if (tab === 'trouble' && !p.trouble) return false;
  return true;
}

/**
 * 優先度順（色 → バッファ小さい順 → 滞留長い順）。
 * 最後に OS_ID で安定化させ、再取得のたびに並びが揺れないようにする。
 */
export function compareInboxPriority(a: Part, b: Part): number {
  const sev = sevRank[a.color] - sevRank[b.color];
  if (sev !== 0) return sev;
  if (a.buffer !== b.buffer) return a.buffer - b.buffer;
  if (a.stagnant !== b.stagnant) return b.stagnant - a.stagnant;
  return a.id.localeCompare(b.id);
}

export function buildInbox(parts: Part[], state: InboxState): Part[] {
  return parts.filter((p) => matchInboxFilter(p, state)).sort(compareInboxPriority);
}

/** タブごとの件数。確認済みで消えた分は数えない（受信箱の未処理件数と一致させる） */
export function countInboxTabs(parts: Part[], state: InboxState): Record<InboxTab, number> {
  const base = { ...state, tab: 'all' as InboxTab, query: '' };
  const visible = parts.filter((p) => matchInboxFilter(p, base));
  return {
    all: visible.length,
    action: visible.filter((p) => isActionNeeded(p, state.stagnantThreshold)).length,
    trouble: visible.filter((p) => !!p.trouble).length,
  };
}
