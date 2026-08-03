type Props = {
  label?: string;
  /** veil=薄白オーバーレイ＋スピナーのみ（コンテンツ上に被せる） */
  variant?: 'page' | 'inline' | 'overlay' | 'veil';
  className?: string;
};

export function Loading({ label = '読み込み中…', variant = 'page', className }: Props) {
  const spinnerOnly = variant === 'veil';
  return (
    <div className={`loading loading-${variant}${className ? ` ${className}` : ''}`} role="status" aria-live="polite" aria-label={label}>
      <span className="loading-spinner" aria-hidden />
      {!spinnerOnly && <span className="loading-label">{label}</span>}
    </div>
  );
}
