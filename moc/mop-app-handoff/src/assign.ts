// 担当者の自動割り当て（初期値登録）。ボタン押下で実行する一括処理。
//  - 対象は「未割当」の部品のみ。既存の割当は絶対に上書きしない。
//    （取込で増えた新規部品は未割当で入るので、再度ボタンを押せば新規分だけ埋まる）
//  - 割当ロジック：部品の 機種 を担当する担当者（m_owner_kishu）へ割り当てる。
//    複数人が同じ機種を担当していれば件数が均等になるよう最小負荷の人へ。
//    どの担当者もその機種を担当していない場合は「未割当」のまま残す。
import { pool } from './db.ts';

export interface AssignSummary {
  targeted: number;    // 実行時に未割当だった件数
  assigned: number;    // 今回割り当てた件数
  leftover: number;    // 担当者がいない機種で未割当のまま残った件数
  byOwner: { owner: string; count: number }[];
}

export async function autoAssign(): Promise<AssignSummary> {
  // 機種 → その機種を担当する担当者(氏名)。有効な担当者のみ。
  const rel = await pool.query(`
    SELECT ok.kishu, o.name
    FROM m_owner_kishu ok
    JOIN m_owner o ON o.owner_id = ok.owner_id
    WHERE o.active`);
  const kishuOwners = new Map<string, string[]>();
  for (const r of rel.rows) {
    const kishu = String(r.kishu); const name = String(r.name);
    if (!kishuOwners.has(kishu)) kishuOwners.set(kishu, []);
    kishuOwners.get(kishu)!.push(name);
  }

  // 負荷平準化の起点＝現在の担当件数（未割当を除く）
  const cnt = await pool.query("SELECT owner, count(*)::int c FROM t_assignment WHERE owner <> '未割当' GROUP BY owner");
  const load = new Map<string, number>(cnt.rows.map((r) => [String(r.owner), Number(r.c)]));
  for (const names of kishuOwners.values()) for (const n of names) if (!load.has(n)) load.set(n, 0);
  const pickLeast = (cands: string[]): string | null => {
    if (!cands.length) return null;
    let best = cands[0];
    for (const c of cands) if ((load.get(c) ?? 0) < (load.get(best) ?? 0)) best = c;
    load.set(best, (load.get(best) ?? 0) + 1);
    return best;
  };

  // 未割当の部品（機種つき）。os_id 昇順で決定的に
  const parts = await pool.query(`
    SELECT s.os_id, s.kishu
    FROM t_part_status s
    JOIN t_assignment a ON a.os_id = s.os_id
    WHERE a.owner = '未割当'
    ORDER BY s.os_id`);
  const targeted = parts.rows.length;

  const assignMap = new Map<string, string>(); // os_id -> owner
  let leftover = 0;
  for (const p of parts.rows) {
    const owner = pickLeast(kishuOwners.get(String(p.kishu ?? '')) ?? []);
    if (!owner) { leftover++; continue; } // 担当者がいない機種 → 未割当のまま
    assignMap.set(String(p.os_id), owner);
  }

  // owner別にまとめて UPDATE（未割当ガード付き＝既存割当は絶対に変えない）
  const byOwnerMap = new Map<string, string[]>();
  for (const [osId, owner] of assignMap) {
    if (!byOwnerMap.has(owner)) byOwnerMap.set(owner, []);
    byOwnerMap.get(owner)!.push(osId);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [owner, ids] of byOwnerMap) {
      for (let i = 0; i < ids.length; i += 1000) {
        const chunk = ids.slice(i, i + 1000);
        await client.query(
          "UPDATE t_assignment SET owner=$1, assigned_at=now() WHERE owner='未割当' AND os_id = ANY($2::text[])",
          [owner, chunk],
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const byOwner = [...byOwnerMap].map(([owner, ids]) => ({ owner, count: ids.length })).sort((a, b) => b.count - a.count);
  return { targeted, assigned: assignMap.size, leftover, byOwner };
}
