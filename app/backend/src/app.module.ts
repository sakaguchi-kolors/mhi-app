import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PartsModule } from './parts/parts.module';
import { MetaModule } from './meta/meta.module';
import { HeatmapModule } from './heatmap/heatmap.module';
import { LtModule } from './lt/lt.module';
import { MastersModule } from './masters/masters.module';
import { OwnersModule } from './owners/owners.module';
import { EtlModule } from './etl/etl.module';
import { AuditModule } from './audit/audit.module';
import { BatchModule } from './batch/batch.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AppConfigModule,
    PrismaModule,
    AuthModule,
    PartsModule,
    MetaModule,
    HeatmapModule,
    LtModule,
    MastersModule,
    OwnersModule,
    EtlModule,
    AuditModule,
    BatchModule,
    HealthModule,
  ],
})
export class AppModule {}
