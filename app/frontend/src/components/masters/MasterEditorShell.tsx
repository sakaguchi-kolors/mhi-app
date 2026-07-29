import type { ReactNode } from 'react';

type Props = {
  title: string;
  note?: string;
  children: ReactNode;
};

/** マスタ Editor 共通のカードレイアウト */
export function MasterEditorShell({ title, note, children }: Props) {
  return (
    <div className="master-forms">
      <div className="master-card">
        <h4>{title}</h4>
        {note && <p className="mnote">{note}</p>}
        {children}
      </div>
    </div>
  );
}
