import { Module } from '@nestjs/common';
import { MastersController } from './masters.controller';
import { MastersService } from './masters.service';
import { MastersRepository } from './masters.repository';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [MastersController],
  providers: [MastersService, MastersRepository],
})
export class MastersModule {}
