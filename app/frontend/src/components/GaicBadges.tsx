import type { TimelineCell } from '../types';
import { gaicEtaBadge, gaicPhaseBadgeClass, gaicPhaseLabel, gaicReqBadge } from '../util';

/** 外注工程のステータス・補足バッジ（詳細タイムライン用） */
export function GaicBadges({ t }: { t: TimelineCell }) {
  if (!t.gaic || !t.gphase) return null;
  const req = gaicReqBadge(t.greq);
  const eta = gaicEtaBadge(t.geta);
  return (
    <span className="gaic-badges">
      <span className={`gaic-tag ${gaicPhaseBadgeClass(t.gphase)}`}>{gaicPhaseLabel[t.gphase]}</span>
      <span className={`gaic-tag ${req.cls}`}>{req.text}</span>
      <span className={`gaic-tag ${eta.cls}`}>{eta.text}</span>
    </span>
  );
}
