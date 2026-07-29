import { useCallback, useEffect, useState } from 'react';
import type { Part } from '../../types';

type Props = {
  part: Part;
  title?: string;
  onClose: () => void;
  onSave: (text: string) => void;
};

export function MemoModal({ part, title = 'メモ', onClose, onSave }: Props) {
  const [text, setText] = useState(part.memo ?? '');

  const handleClose = useCallback(() => {
    if (text !== (part.memo ?? '')) {
      if (!confirm('変更内容が破棄されます。閉じますか？')) return;
    }
    onClose();
  }, [text, part.memo, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  return (
    <div className="modal-bg" onClick={handleClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="memo-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="memo-modal-title">{title}</h3>
        <p className="msub">
          {part.name}（{part.partNo}）
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="困っている内容・経緯・依頼先などを記入…"
        />
        <div className="modal-btns">
          <button type="button" className="cancel" onClick={handleClose}>
            キャンセル
          </button>
          <button type="button" className="save" onClick={() => onSave(text)}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
