import { useCallback, useEffect, useState } from 'react';
import type { OwnerRow } from '../types';
import * as api from '../api';
import type { ToastState } from './Toast';

// 担当者マスタ：担当者ごとに担当する機種をチェックボックスで設定（多対多）。
// 機種列は既定で畳んでおき、ボタンで展開する（圧迫感を避ける）。展開時は氏名を左に固定。
export function OwnerKishu({ toast }: { toast: ToastState }) {
  const [kishus, setKishus] = useState<string[]>([]);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [newRow, setNewRow] = useState({ name: '', ad_account: '', role: '工程員', active: true });
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getOwners();
      setKishus(d.kishus);
      setOwners(d.owners);
    } catch (e) { console.error(e); toast.show('担当者の取得に失敗しました'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const setField = (id: number, key: keyof OwnerRow, val: unknown) =>
    setOwners((prev) => prev.map((o) => (o.owner_id === id ? { ...o, [key]: val } : o)));

  const savePerson = async (o: OwnerRow) => {
    try {
      await api.saveMasterRow('owner', { owner_id: o.owner_id, name: o.name, ad_account: o.ad_account, role: o.role, active: o.active });
      toast.show('保存しました');
    } catch (e) { console.error(e); toast.show('保存に失敗しました'); }
  };
  const delPerson = async (o: OwnerRow) => {
    if (!confirm(`担当者「${o.name}」を削除しますか？`)) return;
    try { await api.deleteMasterRow('owner', String(o.owner_id)); await load(); toast.show('削除しました'); }
    catch (e) { console.error(e); toast.show('削除に失敗しました'); }
  };
  const addPerson = async () => {
    if (!newRow.name.trim()) { toast.show('氏名を入力してください'); return; }
    try {
      await api.saveMasterRow('owner', newRow);
      setNewRow({ name: '', ad_account: '', role: '工程員', active: true });
      await load();
      toast.show('追加しました（機種はチェックで設定できます）');
    } catch (e) { console.error(e); toast.show('追加に失敗しました'); }
  };
  const toggle = async (o: OwnerRow, kishu: string, on: boolean) => {
    setOwners((prev) => prev.map((x) => x.owner_id === o.owner_id
      ? { ...x, kishus: on ? [...x.kishus, kishu] : x.kishus.filter((k) => k !== kishu) } : x)); // 楽観更新
    try { await api.toggleOwnerKishu(o.owner_id, kishu, on); }
    catch (e) { console.error(e); toast.show('担当機種の更新に失敗しました'); load(); }
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>担当者</h2>
          <p>担当者ごとに、担当する機種にチェックを入れてください。複数人が同じ機種を担当してもOK（自動割り当てで均等に配分）。どの担当者もチェックしていない機種は未割当のまま残ります。</p>
        </div>
        <button className="back-btn" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '▼ 機種を隠す' : '▶ 機種の担当を編集'}
        </button>
      </div>
      <div className="panel">
        <div className="table-wrap">
          <table className="mtable owner-kishu">
            <thead>
              <tr>
                <th className="sticky-col">氏名</th>
                <th>ADアカウント</th>
                <th>ロール</th>
                <th>有効</th>
                {expanded
                  ? kishus.map((k) => <th key={k} className="kcol" title={`機種 ${k}`}>{k}</th>)
                  : <th>担当機種</th>}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((o) => {
                const set = new Set(o.kishus);
                return (
                  <tr key={o.owner_id}>
                    <td className="sticky-col"><input type="text" value={o.name} onChange={(e) => setField(o.owner_id, 'name', e.target.value)} /></td>
                    <td><input type="text" value={o.ad_account ?? ''} onChange={(e) => setField(o.owner_id, 'ad_account', e.target.value)} /></td>
                    <td>
                      <select value={o.role} onChange={(e) => setField(o.owner_id, 'role', e.target.value)}>
                        <option value="工程員">工程員</option><option value="管理者">管理者</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}><input type="checkbox" checked={o.active} onChange={(e) => setField(o.owner_id, 'active', e.target.checked)} /></td>
                    {expanded
                      ? kishus.map((k) => (
                        <td key={k} className="kcell">
                          <input type="checkbox" checked={set.has(k)} onChange={(e) => toggle(o, k, e.target.checked)} />
                        </td>
                      ))
                      : <td className="ksum">{o.kishus.length ? `${o.kishus.length}機種：${[...o.kishus].sort().join('・')}` : <span style={{ color: 'var(--muted)' }}>未設定</span>}</td>}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="mbtn save" onClick={() => savePerson(o)}>保存</button>{' '}
                      <button className="mbtn del" onClick={() => delPerson(o)}>削除</button>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: '#f7faff' }}>
                <td className="sticky-col"><input type="text" placeholder="氏名" value={newRow.name} onChange={(e) => setNewRow((p) => ({ ...p, name: e.target.value }))} /></td>
                <td><input type="text" placeholder="アカウント" value={newRow.ad_account} onChange={(e) => setNewRow((p) => ({ ...p, ad_account: e.target.value }))} /></td>
                <td>
                  <select value={newRow.role} onChange={(e) => setNewRow((p) => ({ ...p, role: e.target.value }))}>
                    <option value="工程員">工程員</option><option value="管理者">管理者</option>
                  </select>
                </td>
                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={newRow.active} onChange={(e) => setNewRow((p) => ({ ...p, active: e.target.checked }))} /></td>
                <td style={{ color: 'var(--muted)', fontSize: 11 }}>追加後に機種を選べます</td>
                <td><button className="mbtn add" onClick={addPerson}>＋追加</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
