import { useCallback, useEffect, useState } from 'react';
import type { OwnerRow } from '../types';
import * as api from '../api';
import type { ToastState } from './Toast';
import { KishuMultiSelect } from './KishuMultiSelect';

const isEngineer = (role: string) => role !== '管理者';

async function clearKishus(userId: number, list: string[]) {
  for (const kishu of list) {
    await api.toggleOwnerKishu(userId, kishu, false);
  }
}

// 担当者＝ログインユーザー。表示名・メール・パスワード・役割・担当機種を編集。
export function OwnerKishu({ toast }: { toast: ToastState }) {
  const [kishus, setKishus] = useState<string[]>([]);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [passwords, setPasswords] = useState<Record<number, string>>({});
  const [newRow, setNewRow] = useState({ email: '', displayName: '', password: '', role: '工程員', active: true, kishus: [] as string[] });

  const load = useCallback(async () => {
    try {
      const d = await api.getOwners();
      const stale = d.owners.filter((o) => !isEngineer(o.role) && o.kishus.length);
      for (const o of stale) {
        await clearKishus(o.user_id, o.kishus);
      }
      if (stale.length) {
        const refreshed = await api.getOwners();
        setKishus(refreshed.kishus);
        setOwners(refreshed.owners);
      } else {
        setKishus(d.kishus);
        setOwners(d.owners);
      }
      setPasswords({});
    } catch (e) {
      console.error(e);
      toast.show('担当者の取得に失敗しました');
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const setField = (id: number, key: keyof OwnerRow, val: unknown) =>
    setOwners((prev) => prev.map((o) => (o.user_id === id ? { ...o, [key]: val } : o)));

  const changeRole = async (o: OwnerRow, role: string) => {
    if (!isEngineer(role) && o.kishus.length) {
      try {
        await clearKishus(o.user_id, o.kishus);
        setOwners((prev) => prev.map((x) => (x.user_id === o.user_id ? { ...x, role, kishus: [] } : x)));
      } catch (e) {
        console.error(e);
        toast.show('担当機種の解除に失敗しました');
        load();
      }
      return;
    }
    setField(o.user_id, 'role', role);
  };

  const savePerson = async (o: OwnerRow) => {
    const password = passwords[o.user_id]?.trim();
    if (password && password.length < 8) {
      toast.show('パスワードは8文字以上にしてください');
      return;
    }
    try {
      await api.updateUser(o.user_id, {
        displayName: o.displayName,
        email: o.email,
        role: o.role,
        active: o.active,
        ...(password ? { password } : {}),
      });
      toast.show('保存しました');
      await load();
    } catch (e) {
      console.error(e);
      toast.show(e instanceof Error ? e.message : '保存に失敗しました');
    }
  };

  const deactivatePerson = async (o: OwnerRow) => {
    if (!confirm(`担当者「${o.displayName}」を無効化しますか？\n（ログイン不可・割当候補から除外）`)) return;
    try {
      await api.updateUser(o.user_id, { active: false });
      await load();
      toast.show('無効化しました');
    } catch (e) {
      console.error(e);
      toast.show(e instanceof Error ? e.message : '無効化に失敗しました');
    }
  };

  const addPerson = async () => {
    if (!newRow.email.trim()) {
      toast.show('メールアドレスを入力してください');
      return;
    }
    if (newRow.password.length < 8) {
      toast.show('パスワードは8文字以上にしてください');
      return;
    }
    try {
      const created = await api.createUser({
        email: newRow.email.trim(),
        password: newRow.password,
        displayName: newRow.displayName.trim() || newRow.email.trim(),
        role: newRow.role,
      });
      for (const kishu of isEngineer(newRow.role) ? newRow.kishus : []) {
        await api.toggleOwnerKishu(created.userId, kishu, true);
      }
      setNewRow({ email: '', displayName: '', password: '', role: '工程員', active: true, kishus: [] });
      await load();
      toast.show('追加しました');
    } catch (e) {
      console.error(e);
      toast.show(e instanceof Error ? e.message : '追加に失敗しました');
    }
  };

  const toggle = async (o: OwnerRow, kishu: string, on: boolean) => {
    setOwners((prev) =>
      prev.map((x) =>
        x.user_id === o.user_id
          ? { ...x, kishus: on ? [...x.kishus, kishu] : x.kishus.filter((k) => k !== kishu) }
          : x,
      ),
    );
    try {
      await api.toggleOwnerKishu(o.user_id, kishu, on);
    } catch (e) {
      console.error(e);
      toast.show('担当機種の更新に失敗しました');
      load();
    }
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>担当者</h2>
          <p>
            担当者＝ログインユーザーです。表示名・メール・パスワード（変更時のみ）・役割を設定します。
            担当機種は工程員向けの設定で、「未割当を自動割り当て」の対象機種（TJ・37B など）です。
            管理者は部品の担当者にならないため不要です。
          </p>
        </div>
      </div>
      <div className="panel">
        <div className="table-wrap">
          <table className="mtable owner-kishu">
            <thead>
              <tr>
                <th className="sticky-col col-name">表示名</th>
                <th className="col-email">メール</th>
                <th className="col-password">パスワード</th>
                <th className="col-role">役割</th>
                <th>有効</th>
                <th className="col-kishu">担当機種</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((o) => (
                <tr key={o.user_id} className={o.active ? '' : 'row-inactive'}>
                  <td className="sticky-col col-name">
                    <input type="text" value={o.displayName} onChange={(e) => setField(o.user_id, 'displayName', e.target.value)} />
                  </td>
                  <td className="col-email">
                    <input type="email" value={o.email} onChange={(e) => setField(o.user_id, 'email', e.target.value)} />
                  </td>
                  <td className="col-password">
                    <input
                      type="password"
                      placeholder="変更時のみ"
                      value={passwords[o.user_id] ?? ''}
                      onChange={(e) => setPasswords((p) => ({ ...p, [o.user_id]: e.target.value }))}
                    />
                  </td>
                  <td className="col-role">
                    <select value={o.role} onChange={(e) => void changeRole(o, e.target.value)}>
                      <option value="工程員">工程員</option>
                      <option value="管理者">管理者</option>
                    </select>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={o.active} onChange={(e) => setField(o.user_id, 'active', e.target.checked)} />
                  </td>
                  <td className="col-kishu">
                    {isEngineer(o.role) ? (
                      <KishuMultiSelect
                        options={kishus}
                        value={o.kishus}
                        disabled={!o.active}
                        onToggle={(kishu, on) => toggle(o, kishu, on)}
                      />
                    ) : (
                      <span className="kishu-ms-na">—</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="mbtn save" onClick={() => savePerson(o)}>保存</button>{' '}
                    {o.active && (
                      <button type="button" className="mbtn del" onClick={() => deactivatePerson(o)}>無効化</button>
                    )}
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f7faff' }}>
                <td className="sticky-col col-name">
                  <input type="text" placeholder="表示名" value={newRow.displayName} onChange={(e) => setNewRow((p) => ({ ...p, displayName: e.target.value }))} />
                </td>
                <td className="col-email">
                  <input type="email" placeholder="メール" value={newRow.email} onChange={(e) => setNewRow((p) => ({ ...p, email: e.target.value }))} />
                </td>
                <td className="col-password">
                  <input type="password" placeholder="8文字以上" value={newRow.password} onChange={(e) => setNewRow((p) => ({ ...p, password: e.target.value }))} />
                </td>
                <td className="col-role">
                  <select
                    value={newRow.role}
                    onChange={(e) => {
                      const role = e.target.value;
                      setNewRow((p) => ({ ...p, role, kishus: isEngineer(role) ? p.kishus : [] }));
                    }}
                  >
                    <option value="工程員">工程員</option>
                    <option value="管理者">管理者</option>
                  </select>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={newRow.active} onChange={(e) => setNewRow((p) => ({ ...p, active: e.target.checked }))} disabled title="新規は有効で登録されます" />
                </td>
                <td className="col-kishu">
                  {isEngineer(newRow.role) ? (
                    <KishuMultiSelect
                      options={kishus}
                      value={newRow.kishus}
                      onToggle={(kishu, on) =>
                        setNewRow((p) => ({
                          ...p,
                          kishus: on ? [...p.kishus, kishu] : p.kishus.filter((k) => k !== kishu),
                        }))
                      }
                    />
                  ) : (
                    <span className="kishu-ms-na">—</span>
                  )}
                </td>
                <td><button type="button" className="mbtn add" onClick={addPerson}>＋追加</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
