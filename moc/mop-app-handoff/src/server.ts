// REST API（Express）：一覧／詳細／担当者・困りごと・メモ更新
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { CONFIG, ROOT } from './config.ts';
import { q } from './db.ts';
import { MASTERS, masterByName, type ColDef } from './masters.ts';
import { recompute } from './etl.ts';
import { ingestInfo, startIngest } from './ingest.ts';
import { autoAssign } from './assign.ts';
import type { Part, TimelineCell } from './types.ts';

const app = express();
app.use(cors());
app.use(express.json());
// ローカルはフロントを同一オリジンで配信（CORS/ポート問題を避ける）。
// 本番は Next.js 静的エクスポート→IIS配信に置き換え。
app.use(express.static(path.join(ROOT, 'web')));

function mmdd(d: Date | null): string | undefined {
  if (!d) return undefined;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function ymd(d: Date | null): string {
  if (!d) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function daysSince(from: Date | null, asOf: Date): number | null {
  if (!from) return null;
  const a = Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const b = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.max(0, Math.round((a - b) / 86400000));
}

async function buildParts(): Promise<Part[]> {
  const asOf = new Date(CONFIG.asOf + 'T00:00:00');
  const [status, timeline, assign, trouble, note, vendor] = await Promise.all([
    q(`SELECT * FROM t_part_status`),
    q(`SELECT * FROM t_timeline ORDER BY os_id, seq`),
    q(`SELECT os_id, owner, assigned_at FROM t_assignment`),
    q(`SELECT os_id, flagged, flagged_at, memo FROM t_trouble`),
    q(`SELECT os_id, body FROM t_note`),
    q(`SELECT order_prefix, vendor_name FROM m_vendor WHERE active`),
  ]);
  // 外注先名の解決（注文番号の前方一致・長いprefix優先）
  const vendors = vendor.rows
    .map((r) => ({ prefix: String(r.order_prefix), name: String(r.vendor_name) }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  const vendorOf = (order?: string): string | undefined => {
    if (!order) return undefined;
    return vendors.find((v) => order.startsWith(v.prefix))?.name;
  };

  const tlByOs = new Map<string, TimelineCell[]>();
  for (const r of timeline.rows) {
    const cell: TimelineCell = {
      shop: r.shop, name: r.name, status: r.status,
      plan: mmdd(r.plan_end),
    };
    if (r.is_milestone) {
      cell.milestone = true;
      cell.mpassed = r.ms_passed ?? false;
      if (!cell.mpassed) { cell.mcolor = r.ms_color ?? undefined; cell.mdue = mmdd(r.ms_due); }
    }
    if (r.gaic) {
      cell.gaic = true; cell.gorder = r.order_no ?? undefined; cell.gstat = r.gaic_status ?? undefined;
      cell.gvendor = vendorOf(r.order_no ?? undefined);
    }
    if (!tlByOs.has(r.os_id)) tlByOs.set(r.os_id, []);
    tlByOs.get(r.os_id)!.push(cell);
  }
  const aMap = new Map(assign.rows.map((r) => [r.os_id, r]));
  const tMap = new Map(trouble.rows.map((r) => [r.os_id, r]));
  const nMap = new Map(note.rows.map((r) => [r.os_id, r]));

  return status.rows.map((s): Part => {
    const a = aMap.get(s.os_id);
    const t = tMap.get(s.os_id);
    const owner = a?.owner ?? '未割当';
    return {
      id: s.os_id, partNo: s.part_no, name: s.part_name, category: s.category,
      kishu: s.kishu ?? '',
      finalDue: ymd(s.final_due), daysLeft: s.days_left,
      totalShops: s.total_shops, doneShops: s.done_shops, remainShops: s.remain_shops,
      buffer: s.buffer, color: s.color, stagnant: s.stagnant_days,
      urgent: s.urgent, shortage: s.shortage, currentShop: s.current_shop,
      timeline: tlByOs.get(s.os_id) ?? [],
      inst: String(s.os_id).replace(/\D/g, '').slice(-4),
      owner,
      ownerDays: owner === '未割当' ? null : daysSince(a?.assigned_at ?? null, asOf),
      trouble: t?.flagged ?? false,
      troubleDays: t?.flagged ? daysSince(t?.flagged_at ?? null, asOf) : null,
      memo: t?.memo ?? '',
      note: nMap.get(s.os_id)?.body ?? '',
    };
  });
}

// 非同期ルートの例外を必ずエラーハンドラへ渡すラッパ（Express4は自動転送しないため）
const ah = (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

app.get('/api/meta', ah(async (_req, res) => {
  const owners = await q<{ name: string }>(`SELECT name FROM m_owner WHERE active ORDER BY owner_id`);
  const ds = (await q<{ value: string }>(`SELECT value FROM m_param WHERE key='DUE_SOURCE'`)).rows[0]?.value ?? CONFIG.dueSource;
  res.json({ asOf: CONFIG.asOf, owners: ['未割当', ...owners.rows.map((r) => r.name)], dueSource: ds });
}));

app.get('/api/parts', ah(async (_req, res) => {
  res.json(await buildParts());
}));

app.post('/api/parts/:id/owner', ah(async (req, res) => {
  const owner = (req.body ?? {}).owner;
  if (owner != null && typeof owner !== 'string') return res.status(400).json({ error: 'owner must be a string' });
  const val = owner ?? '未割当';
  const assignedAt = val !== '未割当' ? 'now()' : 'NULL';
  await q(
    `INSERT INTO t_assignment(os_id, owner, assigned_at) VALUES($1,$2,${assignedAt})
     ON CONFLICT (os_id) DO UPDATE SET owner=EXCLUDED.owner, assigned_at=${assignedAt}`,
    [req.params.id, val],
  );
  res.json({ ok: true });
}));

app.post('/api/parts/:id/trouble', ah(async (req, res) => {
  const flagged = !!(req.body ?? {}).flagged;
  const at = flagged ? 'now()' : 'NULL';
  await q(
    `INSERT INTO t_trouble(os_id, flagged, flagged_at) VALUES($1,$2,${at})
     ON CONFLICT (os_id) DO UPDATE SET flagged=EXCLUDED.flagged, flagged_at=${at}`,
    [req.params.id, flagged],
  );
  res.json({ ok: true });
}));

app.post('/api/parts/:id/memo', ah(async (req, res) => {
  const memo = String((req.body ?? {}).memo ?? '');
  await q(
    `INSERT INTO t_trouble(os_id, memo) VALUES($1,$2)
     ON CONFLICT (os_id) DO UPDATE SET memo=EXCLUDED.memo`,
    [req.params.id, memo],
  );
  res.json({ ok: true });
}));

app.post('/api/parts/:id/note', ah(async (req, res) => {
  const body = String((req.body ?? {}).note ?? '');
  await q(
    `INSERT INTO t_note(os_id, body, updated_at) VALUES($1,$2,now())
     ON CONFLICT (os_id) DO UPDATE SET body=EXCLUDED.body, updated_at=now()`,
    [req.params.id, body],
  );
  res.json({ ok: true });
}));

// ===================== マスタ管理 =====================
const appUser = (req: express.Request) => String(req.header('x-app-user') || '管理者(ローカル)');
function coerce(col: ColDef, v: unknown): unknown {
  if (v === '' || v === undefined || v === null) return null;
  if (col.type === 'number') return Number(v);
  if (col.type === 'bool') return v === true || v === 'true' || v === 'on';
  return String(v);
}
async function audit(user: string, action: string, target: string, ref: string, before: unknown, after: unknown) {
  await q(
    `INSERT INTO t_audit_log(app_user,action,target,ref,before,after) VALUES($1,$2,$3,$4,$5,$6)`,
    [user, action, target, ref, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
  );
}

// マスタ定義一覧（UI構築用）
app.get('/api/masters', (_req, res) => res.json(MASTERS));

// 1マスタの全行
app.get('/api/masters/:name', ah(async (req, res) => {
  const def = masterByName(req.params.name);
  if (!def) return res.status(404).json({ error: 'unknown master' });
  const rows = (await q(`SELECT * FROM ${def.table} ORDER BY ${def.pk}`)).rows;
  res.json(rows);
}));

// upsert（新規/更新）
app.post('/api/masters/:name', async (req, res) => {
  const def = masterByName(req.params.name);
  if (!def) return res.status(404).json({ error: 'unknown master' });
  const body = req.body ?? {};
  try {
    const pkVal = body[def.pk];
    const cols = def.columns.map((c) => c.key).filter((k) => k in body);
    if (def.autoId && pkVal) {
      // 自動採番の更新
      const before = (await q(`SELECT * FROM ${def.table} WHERE ${def.pk}=$1`, [pkVal])).rows[0];
      const set = cols.map((k, i) => `${k}=$${i + 2}`).join(',');
      const vals = cols.map((k) => coerce(def.columns.find((c) => c.key === k)!, body[k]));
      const row = (await q(`UPDATE ${def.table} SET ${set} WHERE ${def.pk}=$1 RETURNING *`, [pkVal, ...vals])).rows[0];
      await audit(appUser(req), 'master.update', def.table, String(pkVal), before, row);
      return res.json(row);
    }
    if (def.autoId) {
      // 自動採番の新規
      const vals = cols.map((k) => coerce(def.columns.find((c) => c.key === k)!, body[k]));
      const ph = cols.map((_, i) => `$${i + 1}`).join(',');
      const row = (await q(`INSERT INTO ${def.table}(${cols.join(',')}) VALUES(${ph}) RETURNING *`, vals)).rows[0];
      await audit(appUser(req), 'master.insert', def.table, String(row[def.pk]), null, row);
      return res.json(row);
    }
    // 自然キー（keyやshop等）: ON CONFLICT で upsert
    const allCols = cols.includes(def.pk) ? cols : [def.pk, ...cols];
    const before = pkVal ? (await q(`SELECT * FROM ${def.table} WHERE ${def.pk}=$1`, [pkVal])).rows[0] : null;
    const vals = allCols.map((k) => coerce(def.columns.find((c) => c.key === k) ?? { key: k, label: k, type: 'text' }, body[k]));
    const ph = allCols.map((_, i) => `$${i + 1}`).join(',');
    const upd = allCols.filter((k) => k !== def.pk).map((k) => `${k}=EXCLUDED.${k}`).join(',');
    const row = (await q(
      `INSERT INTO ${def.table}(${allCols.join(',')}) VALUES(${ph})
       ON CONFLICT (${def.pk}) DO UPDATE SET ${upd} RETURNING *`, vals,
    )).rows[0];
    await audit(appUser(req), before ? 'master.update' : 'master.insert', def.table, String(pkVal), before, row);
    res.json(row);
  } catch (e) {
    console.error(e); res.status(400).json({ error: String(e) });
  }
});

// 削除
app.delete('/api/masters/:name/:id', ah(async (req, res) => {
  const def = masterByName(req.params.name);
  if (!def) return res.status(404).json({ error: 'unknown master' });
  const before = (await q(`SELECT * FROM ${def.table} WHERE ${def.pk}=$1`, [req.params.id])).rows[0];
  await q(`DELETE FROM ${def.table} WHERE ${def.pk}=$1`, [req.params.id]);
  await audit(appUser(req), 'master.delete', def.table, req.params.id, before, null);
  res.json({ ok: true });
}));

// 再計算（マスタ編集を算出に反映）。CSVは読まずDB上の取込済みデータから算出のみ＝高速。
app.post('/api/recompute', async (req, res) => {
  try {
    const summary = await recompute();
    await audit(appUser(req), 'recompute', 'batch', '-', null, summary);
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error(e); res.status(500).json({ error: String(e) });
  }
});

// ===================== 取込（指定フォルダ→UI手動取込。将来の定期実行も同一コア） =====================
// フォルダ内ファイル一覧＋プリフライト＋ジョブ状態（フロントはこれをポーリング）
app.get('/api/ingest', ah(async (_req, res) => {
  res.json(await ingestInfo());
}));
// 取込開始（プリフライトNGは422、実行中は409）。runEtlは非同期実行し状態はGETで見せる
app.post('/api/ingest', ah(async (req, res) => {
  const r = await startIngest(appUser(req), audit);
  if (!r.started) return res.status(r.reason === 'busy' ? 409 : 422).json(r);
  res.json(r);
}));

// ===================== 担当者×機種（担当者マスタUI） =====================
// 担当者一覧（各人の担当機種つき）＋全機種リスト。UIのチェックボックス表を構築する
app.get('/api/owners', ah(async (_req, res) => {
  const [kishuRows, ownerRows, relRows] = await Promise.all([
    q<{ kishu: string }>(`SELECT kishu FROM m_kishu WHERE active ORDER BY kishu`),
    q(`SELECT owner_id, name, ad_account, role, active FROM m_owner ORDER BY owner_id`),
    q<{ owner_id: number; kishu: string }>(`SELECT owner_id, kishu FROM m_owner_kishu`),
  ]);
  const byOwner = new Map<number, string[]>();
  for (const r of relRows.rows) {
    const id = Number(r.owner_id);
    if (!byOwner.has(id)) byOwner.set(id, []);
    byOwner.get(id)!.push(String(r.kishu));
  }
  const owners = ownerRows.rows.map((o) => ({
    owner_id: o.owner_id, name: o.name, ad_account: o.ad_account, role: o.role, active: o.active,
    kishus: byOwner.get(Number(o.owner_id)) ?? [],
  }));
  res.json({ kishus: kishuRows.rows.map((r) => r.kishu), owners });
}));

// 担当者の担当機種トグル（チェックON=追加 / OFF=削除）
app.post('/api/owners/:id/kishu', ah(async (req, res) => {
  const ownerId = Number(req.params.id);
  const body = req.body ?? {};
  const kishu = String(body.kishu ?? '');
  const on = !!body.on;
  if (!ownerId || !kishu) return res.status(400).json({ error: 'owner id and kishu required' });
  if (on) await q(`INSERT INTO m_owner_kishu(owner_id, kishu) VALUES($1,$2) ON CONFLICT DO NOTHING`, [ownerId, kishu]);
  else await q(`DELETE FROM m_owner_kishu WHERE owner_id=$1 AND kishu=$2`, [ownerId, kishu]);
  await audit(appUser(req), on ? 'owner.kishu.add' : 'owner.kishu.remove', 'm_owner_kishu', `${ownerId}:${kishu}`, null, null);
  res.json({ ok: true });
}));

// 担当者の自動割り当て（未割当のみ。機種→担当者、担当者不在の機種は未割当のまま）
app.post('/api/assign/auto', ah(async (req, res) => {
  const summary = await autoAssign();
  await audit(appUser(req), 'assign.auto', 'batch', '-', null, summary);
  res.json({ ok: true, ...summary });
}));

// 監査ログ（直近）
app.get('/api/audit', ah(async (_req, res) => {
  const rows = (await q(`SELECT app_user,action,target,ref,at FROM t_audit_log ORDER BY id DESC LIMIT 100`)).rows;
  res.json(rows);
}));

// 未知の /api パスは404（JSONで返す）
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

// グローバルエラーハンドラ（ここに集約。DB断・想定外はすべて500 JSON）
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
});

app.listen(CONFIG.apiPort, () => {
  console.log(`[api] http://localhost:${CONFIG.apiPort}  (asOf=${CONFIG.asOf})`);
});
