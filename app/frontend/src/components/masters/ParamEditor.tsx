import { useMemo, useState, type ReactNode } from 'react';
import type { Part } from '../../types';
import type { Row } from './shared';
import { colorCounts, num, str } from './shared';
import { UpdatedMeta } from './RowHistory';

type Props = {
  rows: Row[];
  parts: Part[];
  onSave: (row: Row) => Promise<void>;
};

const COLOR_LABEL = { green: '緑', yellow: '黄', red: '赤' } as const;

export function ParamEditor({ rows, parts, onSave }: Props) {
  const byKey = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows) m.set(str(r.key), r);
    return m;
  }, [rows]);

  const get = (key: string, fallback = '') => str(byKey.get(key)?.value ?? fallback);
  const desc = (key: string) => str(byKey.get(key)?.description);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const val = (key: string, fallback = '') => (key in draft ? draft[key] : get(key, fallback));

  const setVal = (key: string, v: string) => setDraft((p) => ({ ...p, [key]: v }));

  const green = num(val('BUFFER_GREEN', '1'), 1);
  const yellow = num(val('BUFFER_YELLOW', '0'), 0);
  const current = useMemo(() => colorCounts(parts), [parts]);
  const preview = useMemo(() => colorCounts(parts, green, yellow), [parts, green, yellow]);
  const previewDiffers =
    current.green !== preview.green || current.yellow !== preview.yellow || current.red !== preview.red;

  const stagSaved = num(get('STAGNANT_THRESHOLD', '10'), 10);
  const stagDraft = num(val('STAGNANT_THRESHOLD', '10'), 10);
  const stagCurrent = useMemo(() => parts.filter((p) => p.stagnant >= stagSaved).length, [parts, stagSaved]);
  const stagPreview = useMemo(() => parts.filter((p) => p.stagnant >= stagDraft).length, [parts, stagDraft]);
  const stagPreviewDiffers = stagCurrent !== stagPreview;

  const dueSource = val('DUE_SOURCE', 'flexsche');

  const saveKey = async (key: string) => {
    const row = byKey.get(key);
    if (!row) return;
    await onSave({ ...row, value: val(key) });
    setDraft((p) => {
      const n = { ...p };
      delete n[key];
      return n;
    });
  };

  const dirty = (key: string) => key in draft && draft[key] !== get(key);

  return (
    <div className="master-forms">
      <div className="master-card">
        <h4>緊急度の色分け</h4>
        <p className="mnote">部品のバッファ（余裕日数）に応じて一覧の色が決まります。保存すると一覧に自動反映されます。</p>
        <div className="param-color-scale">
          <span className="swatch green">緑</span>
          <span className="scale-rule">バッファ ≥</span>
          <label className="param-inline">
            <input
              type="number"
              value={val('BUFFER_GREEN', '1')}
              onChange={(e) => setVal('BUFFER_GREEN', e.target.value)}
            />
            <span>日</span>
          </label>
          <span className="swatch yellow">黄</span>
          <span className="scale-rule">バッファ ≥</span>
          <label className="param-inline">
            <input
              type="number"
              value={val('BUFFER_YELLOW', '0')}
              onChange={(e) => setVal('BUFFER_YELLOW', e.target.value)}
            />
            <span>日</span>
          </label>
          <span className="swatch red">赤</span>
          <span className="scale-rule">それ未満</span>
        </div>
        {green < yellow && (
          <p className="param-warn">緑の閾値は黄以上にしてください（現状: 緑 {green} &lt; 黄 {yellow}）。</p>
        )}
        <div className="param-preview">
          <div className="param-preview-title">色の目安（現在のバッファ値で再配色）</div>
          <div className="param-preview-row">
            <span>現状</span>
            {(['green', 'yellow', 'red'] as const).map((c) => (
              <span key={c} className={`pill ${c}`}>
                {COLOR_LABEL[c]} {current[c]}
              </span>
            ))}
          </div>
          <div className="param-preview-row">
            <span>この設定だと</span>
            {(['green', 'yellow', 'red'] as const).map((c) => (
              <span key={c} className={`pill ${c}`}>
                {COLOR_LABEL[c]} {preview[c]}
              </span>
            ))}
            {previewDiffers ? <span className="param-delta">変わる</span> : <span className="param-delta ok">変化なし</span>}
          </div>
          <p className="mnote" style={{ marginBottom: 0 }}>
            ※ Shop LT・カレンダー変更でバッファ自体が変わる場合は、保存後の件数と一致しないことがあります。
          </p>
        </div>
        <div className="param-actions">
          <UpdatedMeta row={byKey.get('BUFFER_GREEN') ?? {}} />
          <button
            type="button"
            className="mbtn save"
            disabled={!dirty('BUFFER_GREEN') && !dirty('BUFFER_YELLOW')}
            onClick={async () => {
              if (dirty('BUFFER_GREEN')) await saveKey('BUFFER_GREEN');
              if (dirty('BUFFER_YELLOW')) await saveKey('BUFFER_YELLOW');
            }}
          >
            色分けを保存
          </button>
        </div>
      </div>

      <div className="master-card">
        <h4>所要日数・マイルストン係数</h4>
        <p className="mnote">保存すると部品一覧・タイムラインに自動反映されます。</p>
        <div className="param-grid">
          <ParamField
            label="1Shopあたりの既定LT"
            unit="日"
            help={desc('SHOP_LT_DAYS') || 'Shop別LT未登録時に使う1工程あたりの所要日数。'}
            effect="残Shopの所要日数 → バッファ（余裕日数）→ 一覧の緊急度色"
            value={val('SHOP_LT_DAYS', '4')}
            dirty={dirty('SHOP_LT_DAYS')}
            onChange={(v) => setVal('SHOP_LT_DAYS', v)}
            onSave={() => saveKey('SHOP_LT_DAYS')}
            row={byKey.get('SHOP_LT_DAYS')}
          />
          <ParamField
            label="マイルストン期日の逆算"
            unit="日/残Shop"
            help={desc('MILESTONE_LT_DAYS') || '検査マイルストンの期日を最終納期から逆算するときの係数。'}
            effect="部品詳細タイムラインのマイルストン期日と、その色分け"
            value={val('MILESTONE_LT_DAYS', '5')}
            dirty={dirty('MILESTONE_LT_DAYS')}
            onChange={(v) => setVal('MILESTONE_LT_DAYS', v)}
            onSave={() => saveKey('MILESTONE_LT_DAYS')}
            row={byKey.get('MILESTONE_LT_DAYS')}
          />
        </div>
      </div>

      <div className="master-card">
        <h4>その他</h4>
        <div className="param-grid">
          <ParamField
            label="滞留日数の閾値"
            unit="日"
            help={desc('STAGNANT_THRESHOLD') || '現在工程の滞留がこの日数以上で 🚩 表示。'}
            effect="一覧の「滞留状況」列・KPI「滞留N日以上」・部品詳細のフラグ（保存後すぐ反映）"
            value={val('STAGNANT_THRESHOLD', '10')}
            dirty={dirty('STAGNANT_THRESHOLD')}
            onChange={(v) => setVal('STAGNANT_THRESHOLD', v)}
            onSave={() => saveKey('STAGNANT_THRESHOLD')}
            row={byKey.get('STAGNANT_THRESHOLD')}
            preview={
              <>
                <div className="param-preview-title">🚩 滞留フラグの件数（現在の滞留日数で判定）</div>
                <div className="param-preview-row">
                  <span>現状（{stagSaved}日以上）</span>
                  <span className="pill yellow">{stagCurrent} 件</span>
                </div>
                <div className="param-preview-row">
                  <span>この設定だと（{stagDraft}日以上）</span>
                  <span className="pill yellow">{stagPreview} 件</span>
                  {stagPreviewDiffers ? <span className="param-delta">変わる</span> : <span className="param-delta ok">変化なし</span>}
                </div>
              </>
            }
          />
          <div className="param-field">
            <label>最終納期の採用元</label>
            <p className="mnote">{desc('DUE_SOURCE') || '一覧・詳細に表示する最終納期の出典。'}</p>
            <p className="param-effect">保存後：最終納期・残日数・バッファが、選んだデータソース基準に切り替わります。</p>
            <div className="param-inline">
              <select value={dueSource} onChange={(e) => setVal('DUE_SOURCE', e.target.value)}>
                <option value="flexsche">flexsche（小日程）</option>
                <option value="pbs">pbs（計画納期）</option>
              </select>
              <button type="button" className="mbtn save" disabled={!dirty('DUE_SOURCE')} onClick={() => saveKey('DUE_SOURCE')}>
                保存
              </button>
            </div>
            <p className="mnote" style={{ marginBottom: 0 }}>
              {dueSource === 'flexsche'
                ? '小日程の最終工程日（JND）を最終納期として採用します。'
                : 'PBS計画納期（月）を月末日として最終納期に採用します。'}
              {dirty('DUE_SOURCE') && ' 保存すると、部品ごとの納期・色が更新されます。'}
            </p>
            <UpdatedMeta row={byKey.get('DUE_SOURCE') ?? {}} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ParamField({
  label,
  unit,
  help,
  effect,
  preview,
  value,
  dirty,
  onChange,
  onSave,
  row,
}: {
  label: string;
  unit: string;
  help: string;
  effect?: string;
  preview?: ReactNode;
  value: string;
  dirty: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
  row?: Row;
}) {
  return (
    <div className="param-field">
      <label>{label}</label>
      <p className="mnote">{help}</p>
      {effect && <p className="param-effect">変更すると：{effect}</p>}
      <div className="param-inline">
        <input type="number" value={value} onChange={(e) => onChange(e.target.value)} />
        <span>{unit}</span>
        <button type="button" className="mbtn save" disabled={!dirty} onClick={onSave}>
          保存
        </button>
      </div>
      {preview && <div className="param-preview">{preview}</div>}
      {row && <UpdatedMeta row={row} />}
    </div>
  );
}
