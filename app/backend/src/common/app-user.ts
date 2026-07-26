import type { Request } from 'express';

interface MaybeUser {
  name?: string;
  email?: string;
}

// 操作ユーザーの識別。ログイン済みなら JWT の表示名/メールアドレスを採用（監査ログに残す）。
export const appUser = (req: Request): string => {
  const u = (req as Request & { user?: MaybeUser }).user;
  if (u?.name) return String(u.name);
  if (u?.email) return String(u.email);
  return String(req.header('x-app-user') || '管理者(ローカル)');
};
