// SHOP×JOB 行に旧ルール形式を当てはめてフラグを生成（初回シード移行用）
import { matchMilestone } from '../shared/domain';

export interface MilestoneRuleSeed {
  match_type: string;
  pattern: string;
}

export interface ShopJobRow {
  shop: string;
  job: string;
  name: string | null;
}

export function applyMilestoneRules(
  rows: ShopJobRow[],
  rules: MilestoneRuleSeed[],
): { shop: string; job: string; isMilestone: boolean; gaic: boolean }[] {
  const out: { shop: string; job: string; isMilestone: boolean; gaic: boolean }[] = [];
  for (const r of rows) {
    const name = r.name ?? '';
    let isMilestone = false;
    for (const rule of rules) {
      if (matchMilestone(rule.match_type, rule.pattern, r.shop, name)) {
        isMilestone = true;
        break;
      }
    }
    if (isMilestone) out.push({ shop: r.shop, job: r.job, isMilestone: true, gaic: false });
  }
  return out;
}

export function milestoneRowKey(shop: string, job: string): string {
  return `${shop}::${job}`;
}

export function parseMilestoneRowKey(key: string): { shop: string; job: string } {
  const i = key.indexOf('::');
  if (i < 0) throw new Error(`invalid milestone key: ${key}`);
  return { shop: key.slice(0, i), job: key.slice(i + 2) };
}
