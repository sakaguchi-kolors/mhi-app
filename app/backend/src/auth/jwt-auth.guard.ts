// 全ルートに適用するグローバル認証ガード。
// Cookie(mhi_token) の JWT を検証し req.user に載せる。@Public() のルートは素通り。
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './auth.decorators';

export interface JwtUser {
  sub: number;
  email: string;
  name: string;
  role: string;
}

type ReqWithUser = Request & { user?: JwtUser; cookies?: Record<string, string> };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<ReqWithUser>();
    const token = req.cookies?.['mhi_token'];
    if (token) {
      try {
        req.user = this.jwt.verify<JwtUser>(token);
      } catch {
        /* 無効トークンは未ログイン扱い */
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException('ログインが必要です');
    return true;
  }
}
