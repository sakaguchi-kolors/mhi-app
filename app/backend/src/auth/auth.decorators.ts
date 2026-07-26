import { SetMetadata } from '@nestjs/common';

// 認証不要のルートに付与（ログイン・初回セットアップ等）
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// 必要ロールを指定（例: @Roles('管理者')）
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
