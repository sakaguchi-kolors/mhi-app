import { Module } from '@nestjs/common';
import { EtlService } from './etl.service';
import { IngestService } from './ingest.service';
import { IngestController } from './ingest.controller';
import { IngestUploadInterceptor } from './ingest-upload.interceptor';
import { BatchLockService } from './batch-lock.service';
import { IngestScheduleService } from './ingest-schedule.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [IngestController],
  providers: [EtlService, IngestService, IngestScheduleService, BatchLockService, IngestUploadInterceptor],
  exports: [EtlService, BatchLockService],
})
export class EtlModule {}
