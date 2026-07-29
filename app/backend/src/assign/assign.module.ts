import { Module } from '@nestjs/common';
import { AssignService } from './assign.service';

@Module({
  providers: [AssignService],
  exports: [AssignService],
})
export class AssignModule {}
