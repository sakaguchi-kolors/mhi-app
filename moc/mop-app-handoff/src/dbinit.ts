// スキーマ適用＋マスタ既定シード（冪等）。既定値は現状(v0.1)の挙動を再現する。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.ts';
import { pool } from './db.ts';
import { DEFAULT_PARAMS, DEFAULT_MILESTONES, DEFAULT_CATEGORIES, DEFAULT_OWNERS } from './masters.ts';

async function isEmpty(table: string): Promise<boolean> {
  const { rows } = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
  return Number(rows[0].n) === 0;
}

async function main() {
  const schema = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);

  if (await isEmpty('m_param')) {
    for (const p of DEFAULT_PARAMS)
      await pool.query('INSERT INTO m_param(key,value,description) VALUES($1,$2,$3)', [p.key, p.value, p.description]);
    console.log(`[dbinit] m_param seeded: ${DEFAULT_PARAMS.length}`);
  }
  if (await isEmpty('m_milestone')) {
    for (const m of DEFAULT_MILESTONES)
      await pool.query('INSERT INTO m_milestone(match_type,pattern,label,active) VALUES($1,$2,$3,true)', [m.match_type, m.pattern, m.label]);
    console.log(`[dbinit] m_milestone seeded: ${DEFAULT_MILESTONES.length}`);
  }
  if (await isEmpty('m_category')) {
    for (const c of DEFAULT_CATEGORIES)
      await pool.query('INSERT INTO m_category(pattern,category,priority,active) VALUES($1,$2,$3,true)', [c.pattern, c.category, c.priority]);
    console.log(`[dbinit] m_category seeded: ${DEFAULT_CATEGORIES.length}`);
  }
  if (await isEmpty('m_owner')) {
    for (const name of DEFAULT_OWNERS)
      await pool.query('INSERT INTO m_owner(name,role,active) VALUES($1,$2,true)', [name, '工程員']);
    console.log(`[dbinit] m_owner seeded: ${DEFAULT_OWNERS.length}`);
  }
  // m_shop_lt / m_calendar / m_vendor は既定空（登録すると算出に反映）

  console.log('[dbinit] スキーマ適用・マスタ既定シード完了');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
