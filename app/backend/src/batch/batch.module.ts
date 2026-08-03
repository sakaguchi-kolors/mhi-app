import { Module } from '@nestjs/common';
import { BatchController } from './batch.controller';
import { EtlModule } from '../etl/etl.module';
import { AssignModule } from '../assign/assign.module';
import { AuditModule } from '../audit/audit.module';
import { PartsModule } from '../parts/parts.module';

@Module({
  imports: [EtlModule, AssignModule, AuditModule, PartsModule],
  controllers: [BatchController],
})
export class BatchModule {}
