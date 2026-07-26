import { useMemo, useState } from 'react';
import type { Part } from '../../types';
import type { Row } from './shared';
import { colorCounts, num, str } from './shared';

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
        <p className="mnote">部品のバッファ（余裕日数）に応じて一覧の色が決まります。変更後は再計算で反映されます。</p>
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
            ※ Shop LT・カレンダー変更でバッファ自体が変わる場合は、再計算後の件数と一致しないことがあります。
          </p>
        </div>
        <div className="param-actions">
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
        <div className="param-grid">
          <ParamField
            label="1Shopあたりの既定LT"
            unit="日"
            help={desc('SHOP_LT_DAYS') || 'Shop別LT未登録時に使う所要日数。残所要・バッファに効きます。'}
            value={val('SHOP_LT_DAYS', '4')}
            dirty={dirty('SHOP_LT_DAYS')}
            onChange={(v) => setVal('SHOP_LT_DAYS', v)}
            onSave={() => saveKey('SHOP_LT_DAYS')}
          />
          <ParamField
            label="マイルストン期日の逆算"
            unit="日/残Shop"
            help={desc('MILESTONE_LT_DAYS') || '検査マイルストン期日を最終納期から逆算する係数。'}
            value={val('MILESTONE_LT_DAYS', '5')}
            dirty={dirty('MILESTONE_LT_DAYS')}
            onChange={(v) => setVal('MILESTONE_LT_DAYS', v)}
            onSave={() => saveKey('MILESTONE_LT_DAYS')}
          />
        </div>
      </div>

      <div className="master-card">
        <h4>その他</h4>
        <div className="param-grid">
          <ParamField
            label="滞留日数の閾値"
            unit="日"
            help={desc('STAGNANT_THRESHOLD') || '滞留集計用の閾値。'}
            value={val('STAGNANT_THRESHOLD', '10')}
            dirty={dirty('STAGNANT_THRESHOLD')}
            onChange={(v) => setVal('STAGNANT_THRESHOLD', v)}
            onSave={() => saveKey('STAGNANT_THRESHOLD')}
          />
          <div className="param-field">
            <label>最終納期の採用元</label>
            <p className="mnote">{desc('DUE_SOURCE') || '一覧・詳細に表示する最終納期の出典。'}</p>
            <div className="param-inline">
              <select value={val('DUE_SOURCE', 'flexsche')} onChange={(e) => setVal('DUE_SOURCE', e.target.value)}>
                <option value="flexsche">flexsche（小日程）</option>
                <option value="pbs">pbs（計画納期）</option>
              </select>
              <button type="button" className="mbtn save" disabled={!dirty('DUE_SOURCE')} onClick={() => saveKey('DUE_SOURCE')}>
                保存
              </button>
            </div>
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
  value,
  dirty,
  onChange,
  onSave,
}: {
  label: string;
  unit: string;
  help: string;
  value: string;
  dirty: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="param-field">
      <label>{label}</label>
      <p className="mnote">{help}</p>
      <div className="param-inline">
        <input type="number" value={value} onChange={(e) => onChange(e.target.value)} />
        <span>{unit}</span>
        <button type="button" className="mbtn save" disabled={!dirty} onClick={onSave}>
          保存
        </button>
      </div>
    </div>
  );
}
