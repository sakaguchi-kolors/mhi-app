import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';

export interface MetaResponse {
  asOf: string;
  owners: string[];
  dueSource: string;
}

@Controller('meta')
export class MetaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  async meta(): Promise<MetaResponse> {
    // 割当候補は工程員のみ（管理者は担当者として割り振らない）
    const users = await this.prisma.user.findMany({
      where: { active: true, role: '工程員' },
      orderBy: { displayName: 'asc' },
      select: { displayName: true },
    });
    const ds = await this.prisma.param.findUnique({ where: { key: 'DUE_SOURCE' }, select: { value: true } });
    return {
      asOf: this.config.asOf,
      owners: ['未割当', ...users.map((u) => u.displayName)],
      dueSource: ds?.value ?? this.config.dueSource,
    };
  }
}
