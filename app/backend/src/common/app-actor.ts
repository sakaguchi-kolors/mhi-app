import type { Request } from 'express';
import type { JwtUser } from '../auth/jwt-auth.guard';

type ReqWithUser = Request & { user?: JwtUser };

export function appActor(req: ReqWithUser): JwtUser {
  const u = req.user;
  if (!u) throw new Error('未ログイン');
  return u;
}
