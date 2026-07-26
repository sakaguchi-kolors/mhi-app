// Prisma クライアントを NestJS のライフサイクルに接続するサービス。
// 生SQL（$queryRawUnsafe / $executeRawUnsafe）と型付きモデルアクセスの両方に使う。
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
