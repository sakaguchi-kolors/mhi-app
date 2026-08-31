import { Module } from '@nestjs/common';
import { EtlModule } from '../etl/etl.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [EtlModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
