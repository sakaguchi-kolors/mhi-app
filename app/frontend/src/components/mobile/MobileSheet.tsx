import { useEffect, type ReactNode } from 'react';

/** 画面下から出すシート。PC版の中央モーダルは使わない。 */
export function MobileSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="m-sheet-bg" onClick={onClose} role="presentation">
      <div
        className="m-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="m-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="m-sheet-grab" aria-hidden />
        <h2 id="m-sheet-title" className="m-sheet-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
