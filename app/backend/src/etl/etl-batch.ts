import type { Prisma } from '@prisma/client';

/** 多値INSERT（PostgreSQL プレースホルダ上限を考慮してチャンク分割） */
export async function batchInsert(
  tx: Prisma.TransactionClient,
  table: string,
  cols: string[],
  rows: unknown[][],
  conflict = '',
): Promise<void> {
  if (rows.length === 0) return;
  const chunk = Math.max(1, Math.floor(30000 / cols.length));
  const colList = cols.join(',');
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const tuples = slice.map((row) => {
      const ph = row.map((_, k) => `$${params.length + k + 1}`);
      params.push(...row);
      return `(${ph.join(',')})`;
    });
    await tx.$executeRawUnsafe(`INSERT INTO ${table}(${colList}) VALUES ${tuples.join(',')} ${conflict}`, ...params);
  }
}
