// 認証サービス：メールアドレス＋パスワードでログイン。初回管理者セットアップ・ユーザー管理。
import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from './jwt-auth.guard';

export interface PublicUser {
  userId: number;
  email: string;
  displayName: string;
  role: string;
  active: boolean;
}
export interface CreateUserInput {
  email?: unknown;
  password?: unknown;
  displayName?: unknown;
  role?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async hasAnyUser(): Promise<boolean> {
    return (await this.prisma.user.count()) > 0;
  }

  private normalizeEmail(raw: unknown): string {
    return String(raw ?? '').trim().toLowerCase();
  }

  private assertEmail(email: string): void {
    if (!email || !EMAIL_RE.test(email)) throw new BadRequestException('有効なメールアドレスを入力してください');
  }

  private toPublic(u: {
    userId: number;
    email: string;
    displayName: string;
    role: string;
    active: boolean;
  }): PublicUser {
    return { userId: u.userId, email: u.email, displayName: u.displayName, role: u.role, active: u.active };
  }

  sign(u: PublicUser): string {
    const payload: JwtUser = { sub: u.userId, email: u.email, name: u.displayName, role: u.role };
    return this.jwt.sign(payload);
  }

  async validate(emailRaw: string, password: string): Promise<PublicUser> {
    const email = this.normalizeEmail(emailRaw);
    const u = await this.prisma.user.findUnique({ where: { email } });
    if (!u || !u.active) throw new UnauthorizedException('メールアドレスまたはパスワードが違います');
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) throw new UnauthorizedException('メールアドレスまたはパスワードが違います');
    return this.toPublic(u);
  }

  async createUser(input: CreateUserInput): Promise<PublicUser> {
    const email = this.normalizeEmail(input.email);
    const password = String(input.password ?? '');
    const displayName = String(input.displayName ?? '').trim() || email;
    const role = input.role === '管理者' ? '管理者' : '工程員';
    this.assertEmail(email);
    if (!password) throw new BadRequestException('パスワードは必須です');
    if (password.length < 8) throw new BadRequestException('パスワードは8文字以上にしてください');
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException('そのメールアドレスは既に登録されています');
    const passwordHash = await bcrypt.hash(password, 10);
    const u = await this.prisma.user.create({ data: { email, displayName, role, passwordHash } });
    return this.toPublic(u);
  }

  async setupFirstAdmin(input: CreateUserInput): Promise<PublicUser> {
    if (await this.hasAnyUser()) throw new ForbiddenException('既に管理者が登録されています');
    return this.createUser({ ...input, role: '管理者' });
  }

  async listUsers(): Promise<PublicUser[]> {
    const us = await this.prisma.user.findMany({ orderBy: { userId: 'asc' } });
    return us.map((u) => this.toPublic(u));
  }

  async setActive(userId: number, active: boolean): Promise<void> {
    await this.prisma.user.update({ where: { userId }, data: { active } });
  }

  /** 担当者（ユーザー）情報の更新 */
  async updateUser(
    userId: number,
    input: { displayName?: unknown; role?: unknown; active?: unknown; email?: unknown; password?: unknown },
  ): Promise<PublicUser> {
    const data: { displayName?: string; role?: string; active?: boolean; email?: string; passwordHash?: string } = {};

    if (input.email != null) {
      const email = this.normalizeEmail(input.email);
      this.assertEmail(email);
      const dup = await this.prisma.user.findFirst({ where: { email, NOT: { userId } } });
      if (dup) throw new BadRequestException('そのメールアドレスは既に登録されています');
      data.email = email;
    }
    if (input.password != null && String(input.password) !== '') {
      const password = String(input.password);
      if (password.length < 8) throw new BadRequestException('パスワードは8文字以上にしてください');
      data.passwordHash = await bcrypt.hash(password, 10);
    }
    if (input.displayName != null) {
      const displayName = String(input.displayName).trim();
      if (!displayName) throw new BadRequestException('表示名は必須です');
      data.displayName = displayName;
    }
    if (input.role != null) data.role = input.role === '管理者' ? '管理者' : '工程員';
    if (input.active != null) data.active = !!input.active;

    if (Object.keys(data).length === 0) throw new BadRequestException('更新項目がありません');

    const u = await this.prisma.user.update({ where: { userId }, data });
    return this.toPublic(u);
  }
}
