import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response, CookieOptions } from 'express';
import { AuthService, type CreateUserInput, type PublicUser } from './auth.service';
import { Public, Roles } from './auth.decorators';
import type { JwtUser } from './jwt-auth.guard';

const COOKIE = 'mhi_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private cookieOpts(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true', // 本番HTTPS(IIS)ではtrue
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

  // 現在のログインユーザー（未ログインは user:null）。@Public だが JwtAuthGuard がトークンがあれば載せる。
  @Public()
  @Get('me')
  me(@Req() req: Request & { user?: JwtUser }): { user: PublicUser | null } {
    const u = req.user;
    return {
      user: u ? { userId: u.sub, email: u.email, displayName: u.name, role: u.role, active: true } : null,
    };
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
  @Post('users/:id')
  async update(
    @Param('id') id: string,
    @Body() body: { active?: unknown; displayName?: unknown; role?: unknown; email?: unknown; password?: unknown },
  ): Promise<PublicUser> {
    return this.auth.updateUser(Number(id), body);
  }
}
