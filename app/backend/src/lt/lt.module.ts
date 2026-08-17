import { Module } from '@nestjs/common';
import { LtController } from './lt.controller';
import { LtService } from './lt.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [LtController],
  providers: [LtService],
  exports: [LtService],
})
export class LtModule {}
