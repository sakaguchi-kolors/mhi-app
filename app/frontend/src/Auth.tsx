// ログイン画面と、初回管理者セットアップ画面（メールアドレス＋パスワード）。
import { useState, type FormEvent, type ReactNode } from 'react';
import * as api from './api';
import type { Me } from './api';

function AuthShell({
  title,
  subtitle,
  onSubmit,
  children,
}: {
  title: string;
  subtitle: string;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-brand">部品進捗システム <span>（仮称）</span></div>
        <h2 className="auth-title">{title}</h2>
        <p className="auth-sub">{subtitle}</p>
        {children}
      </form>
    </div>
  );
}

export function Login({ onDone }: { onDone: (u: Me) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await api.login(email.trim(), password);
      onDone(r.user);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'ログインに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="ログイン" subtitle="メールアドレスとパスワードでログインしてください" onSubmit={submit}>
      <label className="auth-field">
        <span>メールアドレス</span>
        <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label className="auth-field">
        <span>パスワード</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      {err && <div className="auth-err">{err}</div>}
      <button type="submit" className="auth-btn" disabled={busy || !email || !password}>
        {busy ? 'ログイン中…' : 'ログイン'}
      </button>
    </AuthShell>
  );
}

export function Setup({ onDone }: { onDone: (u: Me) => void }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (password !== password2) {
      setErr('確認用パスワードが一致しません');
      return;
    }
    setBusy(true);
    try {
      const r = await api.authSetup(email.trim(), password, displayName.trim());
      onDone(r.user);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '登録に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="初期セットアップ" subtitle="最初の管理者アカウントを登録します（この画面は初回のみ表示されます）" onSubmit={submit}>
      <label className="auth-field">
        <span>メールアドレス</span>
        <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="admin@example.com" />
      </label>
      <label className="auth-field">
        <span>表示名</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例：山田 太郎" />
      </label>
      <label className="auth-field">
        <span>パスワード（8文字以上）</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </label>
      <label className="auth-field">
        <span>パスワード（確認）</span>
        <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
      </label>
      {err && <div className="auth-err">{err}</div>}
      <button type="submit" className="auth-btn" disabled={busy || !email || password.length < 8}>
        {busy ? '登録中…' : '管理者を登録して開始'}
      </button>
    </AuthShell>
  );
}
