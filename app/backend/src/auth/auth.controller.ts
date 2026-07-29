import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response, CookieOptions } from 'express';
import { AuthService, type CreateUserInput } from './auth.service';
import { Public, Roles } from './auth.decorators';
import type { PublicUser } from '../shared/types';

const COOKIE = 'mhi_token';

@Controller('auth')
@ApiTags('auth')
@ApiCookieAuth('mhi_token')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private cookieOpts(): CookieOptions {
    const secure =
      process.env.COOKIE_SECURE === 'false'
        ? false
        : process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 12 * 3600 * 1000, // 12時間
    };
  }

  // 初回セットアップが必要か（ユーザー0人か）
  @Public()
  @Get('setup')
  async setupInfo(): Promise<{ needsSetup: boolean }> {
    return { needsSetup: !(await this.auth.hasAnyUser()) };
  }

  // 初回管理者の登録（ユーザーが1人もいない時だけ）
  @Public()
  @Post('setup')
  async setup(@Body() body: CreateUserInput, @Res({ passthrough: true }) res: Response): Promise<{ user: PublicUser }> {
    const u = await this.auth.setupFirstAdmin(body);
    res.cookie(COOKIE, this.auth.sign(u), this.cookieOpts());
    return { user: u };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(
    @Body() body: { email?: unknown; password?: unknown },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: PublicUser }> {
    const u = await this.auth.validate(String(body?.email ?? ''), String(body?.password ?? ''));
    res.cookie(COOKIE, this.auth.sign(u), this.cookieOpts());
    return { user: u };
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }

  // 現在のログインユーザー（未ログインは user:null）
  @Public()
  @Get('me')
  async me(@Req() req: Request & { user?: { sub: number } }): Promise<{ user: PublicUser | null }> {
    const u = req.user;
    if (!u) return { user: null };
    const dbUser = await this.auth.getUserById(u.sub);
    return { user: dbUser };
  }

  // ===== ユーザー管理（管理者のみ） =====
  @Roles('管理者')
  @Get('users')
  users(): Promise<PublicUser[]> {
    return this.auth.listUsers();
  }

  @Roles('管理者')
  @Post('users')
  create(@Body() body: CreateUserInput): Promise<PublicUser> {
    return this.auth.createUser(body);
  }

  @Roles('管理者')
  @Patch('users/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { active?: unknown; displayName?: unknown; role?: unknown; email?: unknown; password?: unknown },
  ): Promise<PublicUser> {
    return this.auth.updateUser(id, body);
  }
}
