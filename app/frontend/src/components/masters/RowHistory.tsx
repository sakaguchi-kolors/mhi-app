import { fmtDateTime, str } from './shared';

export function UpdatedMeta({ row }: { row: Record<string, unknown> }) {
  const by = str(row.updated_by);
  const at = fmtDateTime(row.updated_at == null ? null : String(row.updated_at));
  if (!by && at === '—') return <span className="updated-meta">—</span>;
  return (
    <span className="updated-meta" title={`${by || '—'} / ${at}`}>
      {by || '—'}
      <br />
      <small>{at}</small>
    </span>
  );
}
