// マスタ既定シード（冪等）。プロトタイプ dbinit.ts のシード部分を移植。
import { loadEnv } from '../config/load-env';
loadEnv();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PARAMS, DEFAULT_MILESTONES, DEFAULT_CATEGORIES } from '../masters/masters.def';
import { applyMilestoneRules } from '../masters/milestone-mark.util';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);

  if ((await prisma.param.count()) === 0) {
    await prisma.param.createMany({ data: DEFAULT_PARAMS });
    console.log(`[seed] m_param seeded: ${DEFAULT_PARAMS.length}`);
  }

  if ((await prisma.milestone.count()) === 0) {
    const shopJobs = await prisma.shopMaster.findMany({ select: { shop: true, job: true, name: true } });
    if (shopJobs.length > 0) {
      const marks = applyMilestoneRules(shopJobs, DEFAULT_MILESTONES);
      if (marks.length > 0) {
        await prisma.milestone.createMany({
          data: marks.map((m) => ({ shop: m.shop, job: m.job, isMilestone: m.isMilestone, gaic: m.gaic })),
        });
        console.log(`[seed] m_milestone seeded from SHOP_JOB + 既定ルール: ${marks.length}`);
      } else {
        console.log('[seed] m_milestone: SHOP_JOB あり / 既定ルール一致なし（空のまま）');
      }
    } else {
      console.log('[seed] m_milestone: SHOP_JOB 未取込のためスキップ（先方マスタ待ち）');
    }
  }

  if ((await prisma.category.count()) === 0) {
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ pattern: c.pattern, category: c.category, priority: c.priority, active: true })),
    });
    console.log(`[seed] m_category seeded: ${DEFAULT_CATEGORIES.length}`);
  }

  console.log('[seed] マスタ既定シード完了');
  await app.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
