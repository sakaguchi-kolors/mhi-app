import pg from 'pg';
import { CONFIG } from './config.ts';

export const pool = new pg.Pool(CONFIG.pg);

export async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}
