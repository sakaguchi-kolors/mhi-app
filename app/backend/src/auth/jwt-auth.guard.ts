// 全ルートに適用するグローバル認証ガード。
// Cookie(mhi_token) の JWT を検証し req.user に載せる。@Public() のルートは素通り。
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './auth.decorators';

export interface JwtUser {
  sub: number;
  email: string;
  name: string;
  role: string;
}

type ReqWithUser = Request & { user?: JwtUser; cookies?: Record<string, string> };

const CACHE_TTL_MS = 60_000;

interface CachedUser {
  user: { userId: number; email: string; displayName: string; role: string; active: boolean };
  expiresAt: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly cache = new Map<number, CachedUser>();

  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<ReqWithUser>();
    const token = req.cookies?.['mhi_token'];
    if (token) {
      try {
        const payload = this.jwt.verify<JwtUser>(token);
        const dbUser = await this.resolveUser(payload.sub);
        if (dbUser?.active) {
          req.user = {
            sub: dbUser.userId,
            email: dbUser.email,
            name: dbUser.displayName,
            role: dbUser.role,
          };
        }
      } catch {
        /* 無効トークンは未ログイン扱い */
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException('ログインが必要です');
    return true;
  }

  private async resolveUser(userId: number) {
    const now = Date.now();
    const hit = this.cache.get(userId);
    if (hit && hit.expiresAt > now) return hit.user;

    const u = await this.prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, displayName: true, role: true, active: true },
    });
    if (u) {
      this.cache.set(userId, { user: u, expiresAt: now + CACHE_TTL_MS });
    } else {
      this.cache.delete(userId);
    }
    return u;
  }
}
