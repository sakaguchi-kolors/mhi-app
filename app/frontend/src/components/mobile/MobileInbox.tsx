// スマホ受信箱。優先度順に並べたカードを、上部の3タブで絞り込む。
import { useMemo, useState } from 'react';
import type { Part } from '../../types';
import {
  buildInbox,
  countInboxTabs,
  INBOX_TAB_LABELS,
  type InboxState,
  type InboxTab,
} from '../../lib/mobile-inbox.logic';
import { MobilePartCard } from './MobilePartCard';

const TABS: InboxTab[] = ['all', 'action', 'trouble'];

export function MobileInbox({
  parts,
  owners,
  stagnantThreshold,
  defaultOwner,
  checkedIds,
  onOpen,
  onCheck,
  onTrouble,
}: {
  parts: Part[];
  owners: string[];
  stagnantThreshold: number;
  /** 非管理者は自分の担当を初期表示にする */
  defaultOwner?: string;
  checkedIds: ReadonlySet<string>;
  onOpen: (id: string) => void;
  onCheck: (id: string, on: boolean) => void;
  onTrouble: (id: string, on: boolean) => void;
}) {
  const [tab, setTab] = useState<InboxTab>('all');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState(defaultOwner ?? 'all');
  const [kishu, setKishu] = useState('all');
  const [showChecked, setShowChecked] = useState(false);

  const state = useMemo<InboxState>(
    () => ({ tab, query, owner, kishu, stagnantThreshold, checkedIds, showChecked }),
    [tab, query, owner, kishu, stagnantThreshold, checkedIds, showChecked],
  );
  const list = useMemo(() => buildInbox(parts, state), [parts, state]);
  const counts = useMemo(() => countInboxTabs(parts, state), [parts, state]);
  const kishus = useMemo(() => [...new Set(parts.map((p) => p.kishu).filter(Boolean))].sort(), [parts]);
  const checkedCount = useMemo(
    () => parts.filter((p) => !p.shelved && checkedIds.has(p.id)).length,
    [parts, checkedIds],
  );

  return (
    <div className="m-inbox">
      <div className="m-filters">
        <input
          className="m-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="部品名・部品番号・機種で検索"
          aria-label="検索"
        />
        <div className="m-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`m-tab${tab === t ? ' on' : ''}`}
              onClick={() => setTab(t)}
            >
              {INBOX_TAB_LABELS[t]}
              <span className="m-tab-n">{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="m-selects">
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="担当者">
            <option value="all">担当者：すべて</option>
            {owners.map((o) => (
              <option key={o} value={o}>担当者：{o}</option>
            ))}
          </select>
          <select value={kishu} onChange={(e) => setKishu(e.target.value)} aria-label="機種">
            <option value="all">機種：すべて</option>
            {kishus.map((k) => (
              <option key={k} value={k}>機種：{k}</option>
            ))}
          </select>
        </div>
        {checkedCount > 0 && (
          <button type="button" className="m-checked-toggle" onClick={() => setShowChecked((v) => !v)}>
            {showChecked ? '確認済みを隠す' : `確認済み ${checkedCount} 件を表示`}
          </button>
        )}
      </div>

      <div className="m-list">
        {list.length === 0 ? (
          <p className="m-empty">
            表示する部品がありません。
            <br />
            {tab !== 'all' ? '別のタブを選ぶか、' : ''}検索条件を見直してください。
          </p>
        ) : (
          list.map((p) => (
            <MobilePartCard
              key={p.id}
              part={p}
              stagnantThreshold={stagnantThreshold}
              checked={checkedIds.has(p.id)}
              onOpen={() => onOpen(p.id)}
              onCheck={(on) => onCheck(p.id, on)}
              onTrouble={(on) => onTrouble(p.id, on)}
            />
          ))
        )}
      </div>
    </div>
  );
}
