// ロールガード。@Roles('管理者') の付いたルートを役割で保護する（JwtAuthGuardの後段）。
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './auth.decorators';
import type { JwtUser } from './jwt-auth.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtUser }>();
    if (!req.user || !roles.includes(req.user.role)) throw new ForbiddenException('権限がありません（管理者のみ）');
    return true;
  }
}
