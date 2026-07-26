// ユーザー管理（管理者のみ）：メールアドレス＋パスワードでアカウント登録。
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import * as api from './api';
import type { AppUser } from './api';
import type { ToastState } from './components/Toast';

const empty = { email: '', password: '', displayName: '', role: '工程員' };

export function Users({ toast, meId }: { toast: ToastState; meId: number }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await api.listUsers());
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'ユーザー一覧の取得に失敗しました');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createUser(form);
      toast.show(`ユーザー「${form.email}」を登録しました`);
      setForm(empty);
      await load();
    } catch (ex) {
      toast.show(ex instanceof Error ? ex.message : '登録に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (u: AppUser) => {
    try {
      await api.setUserActive(u.userId, !u.active);
      await load();
    } catch (ex) {
      toast.show(ex instanceof Error ? ex.message : '更新に失敗しました');
    }
  };

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>ユーザー管理</h2>
      <p className="muted">ログインアカウントの登録・管理を行います。役割「管理者」は取込・担当者・マスタ・ユーザー管理にアクセスできます。</p>

      <form className="user-form" onSubmit={create}>
        <input type="email" placeholder="メールアドレス" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="表示名" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <input type="password" placeholder="パスワード(8文字以上)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="工程員">工程員</option>
          <option value="管理者">管理者</option>
        </select>
        <button className="nav-pill active" disabled={busy || !form.email || form.password.length < 8}>登録</button>
      </form>

      <table className="user-table">
        <thead>
          <tr><th>ID</th><th>メールアドレス</th><th>表示名</th><th>役割</th><th>状態</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.userId} className={u.active ? '' : 'row-inactive'}>
              <td>{u.userId}</td>
              <td>{u.email}</td>
              <td>{u.displayName}</td>
              <td>{u.role === '管理者' ? <span className="role-badge admin">管理者</span> : <span className="role-badge">工程員</span>}</td>
              <td>{u.active ? '有効' : '無効'}</td>
              <td>
                {u.userId === meId ? (
                  <span className="muted">（自分）</span>
                ) : (
                  <button className="link-btn" onClick={() => toggle(u)}>{u.active ? '無効化' : '有効化'}</button>
                )}
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 16 }}>ユーザーがいません</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
