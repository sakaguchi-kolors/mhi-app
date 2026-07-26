// マスタ既定シード（冪等）。プロトタイプ dbinit.ts のシード部分を移植。
// スキーマ適用は Prisma migrate が担うため、ここは既定値投入のみ。
// 既定値は現状(v0.1)の挙動を完全再現する。
import { loadEnv } from '../config/load-env';
loadEnv();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PARAMS, DEFAULT_MILESTONES, DEFAULT_CATEGORIES } from '../masters/masters.def';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);

  if ((await prisma.param.count()) === 0) {
    await prisma.param.createMany({ data: DEFAULT_PARAMS });
    console.log(`[seed] m_param seeded: ${DEFAULT_PARAMS.length}`);
  }
  if ((await prisma.milestone.count()) === 0) {
    await prisma.milestone.createMany({
      data: DEFAULT_MILESTONES.map((m) => ({ matchType: m.match_type, pattern: m.pattern, label: m.label, active: true })),
    });
    console.log(`[seed] m_milestone seeded: ${DEFAULT_MILESTONES.length}`);
  }
  if ((await prisma.category.count()) === 0) {
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ pattern: c.pattern, category: c.category, priority: c.priority, active: true })),
    });
    console.log(`[seed] m_category seeded: ${DEFAULT_CATEGORIES.length}`);
  }
  // 担当者は m_user（ユーザー管理）で登録。m_owner シードは廃止。
  // m_shop_lt / m_calendar / m_vendor は既定空（登録すると算出に反映）

  console.log('[seed] マスタ既定シード完了');
  await app.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
