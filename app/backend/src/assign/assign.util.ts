// 担当者自動割当の純粋ロジック（AssignService / テストから利用）

export interface AssignCandidate {
  userId: number;
  name: string;
}

export interface AssignPlanResult {
  assignMap: Map<string, AssignCandidate>;
  leftover: number;
  byOwner: { owner: string; count: number }[];
}

/** 機種ごとの候補ユーザー一覧を構築 */
export function buildKishuUsers(
  users: { userId: number; displayName: string }[],
  rels: { userId: number; kishu: string }[],
): Map<string, AssignCandidate[]> {
  const userName = new Map(users.map((u) => [u.userId, u.displayName]));
  const kishuUsers = new Map<string, AssignCandidate[]>();
  for (const r of rels) {
    const name = userName.get(r.userId);
    if (!name) continue;
    const kishu = String(r.kishu);
    if (!kishuUsers.has(kishu)) kishuUsers.set(kishu, []);
    kishuUsers.get(kishu)!.push({ userId: r.userId, name });
  }
  return kishuUsers;
}

/** 現在の割当件数マップを初期化（候補ユーザーは 0 件から開始） */
export function initAssignLoad(
  existing: { userId: number; count: number }[],
  kishuUsers: Map<string, AssignCandidate[]>,
): Map<number, number> {
  const load = new Map<number, number>(existing.map((r) => [r.userId, r.count]));
  for (const list of kishuUsers.values()) {
    for (const u of list) {
      if (!load.has(u.userId)) load.set(u.userId, 0);
    }
  }
  return load;
}

function pickLeast(cands: AssignCandidate[], load: Map<number, number>): AssignCandidate | null {
  if (!cands.length) return null;
  let best = cands[0];
  for (const c of cands) {
    if ((load.get(c.userId) ?? 0) < (load.get(best.userId) ?? 0)) best = c;
  }
  load.set(best.userId, (load.get(best.userId) ?? 0) + 1);
  return best;
}

/** 未割当 osId 一覧から割当計画を作成（DB 更新は行わない） */
export function planAutoAssign(
  unassignedOsIds: string[],
  kishuOf: Map<string, string>,
  kishuUsers: Map<string, AssignCandidate[]>,
  load: Map<number, number>,
): AssignPlanResult {
  const assignMap = new Map<string, AssignCandidate>();
  let leftover = 0;

  for (const osId of unassignedOsIds) {
    const picked = pickLeast(kishuUsers.get(kishuOf.get(osId) ?? '') ?? [], load);
    if (!picked) {
      leftover++;
      continue;
    }
    assignMap.set(osId, picked);
  }

  const byUserMap = new Map<number, { name: string; count: number }>();
  for (const u of assignMap.values()) {
    const cur = byUserMap.get(u.userId);
    if (cur) cur.count++;
    else byUserMap.set(u.userId, { name: u.name, count: 1 });
  }

  const byOwner = [...byUserMap.values()]
    .map(({ name, count }) => ({ owner: name, count }))
    .sort((a, b) => b.count - a.count);

  return { assignMap, leftover, byOwner };
}
