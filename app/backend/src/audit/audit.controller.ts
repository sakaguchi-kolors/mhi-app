import { Controller, Get } from '@nestjs/common';
import { AuditService, type AuditRow } from './audit.service';
import { Roles } from '../auth/auth.decorators';

@Roles('管理者')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // 監査ログ（直近）
  @Get()
  recent(): Promise<AuditRow[]> {
    return this.audit.recent();
  }
}
