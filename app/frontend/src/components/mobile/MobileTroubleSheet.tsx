import { useState } from 'react';
import {
  TROUBLE_TEMPLATES,
  canConfirmTrouble,
  findTroubleTemplate,
} from '../../lib/mobile-trouble-templates';
import { MobileSheet } from './MobileSheet';

export function MobileTroubleSheet({
  partName,
  onClose,
  onConfirm,
}: {
  partName: string;
  onClose: () => void;
  onConfirm: (templateId: string, note: string) => void;
}) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const template = templateId ? findTroubleTemplate(templateId) : undefined;
  const ok = canConfirmTrouble(template, note);

  return (
    <MobileSheet title="困りごと" onClose={onClose}>
      <p className="m-sheet-sub">{partName}</p>
      <div className="m-sheet-choices" role="listbox" aria-label="困りごとの種類">
        {TROUBLE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="option"
            aria-selected={templateId === t.id}
            className={`m-choice${templateId === t.id ? ' on' : ''}`}
            onClick={() => setTemplateId(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <label className="m-sheet-field">
        <span>{template?.requiresNote ? '理由（必須）' : '補足（任意）'}</span>
        <textarea
          className="m-area"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={template?.requiresNote ? '内容を入力' : '必要なら追記'}
        />
      </label>
      <div className="m-sheet-btns">
        <button type="button" className="m-sheet-btn ghost" onClick={onClose}>やめる</button>
        <button
          type="button"
          className="m-sheet-btn save"
          disabled={!ok}
          onClick={() => {
            if (!templateId || !ok) return;
            onConfirm(templateId, note);
          }}
        >
          立てる
        </button>
      </div>
    </MobileSheet>
  );
}
