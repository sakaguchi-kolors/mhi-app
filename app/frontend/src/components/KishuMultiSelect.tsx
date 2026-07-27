import { useEffect, useId, useMemo, useRef, useState } from 'react';

type Props = {
  options: string[];
  value: string[];
  disabled?: boolean;
  placeholder?: string;
  onToggle: (kishu: string, on: boolean) => void;
};

export function KishuMultiSelect({ options, value, disabled, placeholder = '機種を検索…', onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((k) => k.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  const pick = (kishu: string) => {
    onToggle(kishu, !selected.has(kishu));
  };

  return (
    <div
      ref={rootRef}
      className={`kishu-ms${disabled ? ' disabled' : ''}${open ? ' open' : ''}`}
      onClick={() => !disabled && setOpen(true)}
    >
      <div className="kishu-ms-chips">
        {value.length === 0 && <span className="kishu-ms-empty">{placeholder}</span>}
        {[...value].sort().map((k) => (
          <span key={k} className="kishu-ms-chip">
            {k}
            {!disabled && (
              <button
                type="button"
                className="kishu-ms-chip-x"
                aria-label={`${k} を外す`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(k, false);
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <button type="button" className="kishu-ms-toggle" aria-expanded={open} aria-controls={listId} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
          ▾
        </button>
      )}
      {open && !disabled && (
        <div className="kishu-ms-dropdown" onClick={(e) => e.stopPropagation()}>
          <input
            ref={searchRef}
            type="text"
            className="kishu-ms-search"
            value={query}
            placeholder="機種コードで検索"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
          />
          <ul id={listId} className="kishu-ms-list" role="listbox" aria-multiselectable="true">
            {filtered.length === 0 && <li className="kishu-ms-none">該当なし</li>}
            {filtered.map((k) => {
              const on = selected.has(k);
              return (
                <li key={k}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`kishu-ms-option${on ? ' selected' : ''}`}
                    onClick={() => pick(k)}
                  >
                    <span className="kishu-ms-check">{on ? '✓' : ''}</span>
                    {k}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
