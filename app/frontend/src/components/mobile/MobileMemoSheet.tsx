import { useState } from 'react';
import { MobileSheet } from './MobileSheet';

export function MobileMemoSheet({
  title,
  partName,
  initial,
  placeholder,
  onClose,
  onSave,
}: {
  title: string;
  partName: string;
  initial: string;
  placeholder: string;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initial);

  return (
    <MobileSheet title={title} onClose={onClose}>
      <p className="m-sheet-sub">{partName}</p>
      <textarea
        className="m-area"
        rows={6}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
      />
      <div className="m-sheet-btns">
        <button type="button" className="m-sheet-btn ghost" onClick={onClose}>やめる</button>
        <button type="button" className="m-sheet-btn save" onClick={() => onSave(text)}>保存</button>
      </div>
    </MobileSheet>
  );
}
