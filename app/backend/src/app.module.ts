import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PartsController } from './parts/parts.controller';
import { PartsService } from './parts/parts.service';
import { MetaController } from './meta/meta.controller';
import { MastersController } from './masters/masters.controller';
import { MastersService } from './masters/masters.service';
import { OwnersController } from './owners/owners.controller';
import { OwnersService } from './owners/owners.service';
import { IngestController } from './etl/ingest.controller';
import { IngestService } from './etl/ingest.service';
import { EtlService } from './etl/etl.service';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { AssignService } from './assign/assign.service';
import { BatchController } from './batch/batch.controller';

@Module({
  imports: [AppConfigModule, PrismaModule, AuthModule],
  controllers: [
    PartsController,
    MetaController,
    MastersController,
    OwnersController,
    IngestController,
    AuditController,
    BatchController,
  ],
  providers: [PartsService, MastersService, OwnersService, AssignService, EtlService, IngestService, AuditService],
})
export class AppModule {}
