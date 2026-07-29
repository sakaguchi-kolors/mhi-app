import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { AsOfService } from '../config/as-of.service';
import type { Meta } from '../shared/types';

@Injectable()
export class MetaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly asOf: AsOfService,
  ) {}

  async getMeta(): Promise<Meta> {
    const users = await this.prisma.user.findMany({
      where: { active: true, role: '工程員' },
      orderBy: { displayName: 'asc' },
      select: { displayName: true },
    });
    const [ds, st] = await Promise.all([
      this.prisma.param.findUnique({ where: { key: 'DUE_SOURCE' }, select: { value: true } }),
      this.prisma.param.findUnique({ where: { key: 'STAGNANT_THRESHOLD' }, select: { value: true } }),
    ]);
    const stagnantThreshold = Number(st?.value ?? this.config.stagnantThreshold);
    return {
      asOf: await this.asOf.getEffective(),
      owners: ['未割当', ...users.map((u) => u.displayName)],
      dueSource: ds?.value ?? this.config.dueSource,
      stagnantThreshold: Number.isFinite(stagnantThreshold) ? stagnantThreshold : 10,
    };
  }
}
