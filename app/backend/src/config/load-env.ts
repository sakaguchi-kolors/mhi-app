// .env を process.env に読み込む簡易ローダ（外部依存を増やさない）。
// Prisma Client は実行時に .env を自動ロードしないため、PrismaClient 生成前に呼ぶ必要がある。
// → main.ts / CLIスクリプトの先頭で最初に呼ぶ。
import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(): void {
  const p = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
