import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

const pair = item => (Array.isArray(item) ? item : [item, item]);

/**
 * Type-to-search dropdown. Same API as <Select>: value, options, blank, onChange(event-like).
 */
export function SearchSelect({
  options: choices = [],
  blank,
  value = '',
  onChange,
  required,
  disabled,
  placeholder,
  className = '',
  hideIcon = false,
  ...rest
}) {
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [box, setBox] = useState(null);

  const items = useMemo(() => choices.map(pair), [choices]);
  const selected = items.find(([id]) => String(id) === String(value));

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return items;
    return items.filter(([id, name]) => {
      const hay = (String(name) + ' ' + String(id)).toLowerCase();
      return tokens.every(t => hay.includes(t));
    });
  }, [items, query]);

  const place = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    const height = Math.min(260, Math.max(120, filtered.length * 38 + 8));
    const up = below < height && rect.top > below;
    setBox({
      left: rect.left,
      width: rect.width,
      top: up ? undefined : rect.bottom + 4,
      bottom: up ? window.innerHeight - rect.top + 4 : undefined,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    place();
    const outside = e => {
      if (!wrapRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) close();
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', place);
    };
  }, [open, filtered.length]);

  useEffect(() => {
    listRef.current?.querySelector('.ss-opt.active')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function commit(id) {
    onChange?.({ target: { value: id, name: rest.name } });
    close();
  }

  const onKeyDown = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive(i => Math.min(filtered.length - 1 + (blank !== undefined ? 1 : 0), i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      const offset = blank !== undefined && !query ? 1 : 0;
      if (offset && active === 0) commit('');
      else if (filtered[active - offset]) commit(filtered[active - offset][0]);
    } else if (e.key === 'Escape' && open) {
      e.nativeEvent.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const showBlank = blank !== undefined && !query;

  return (
    <span className={'select-wrap ss-wrap ' + (hideIcon ? 'no-icon ' : '') + className} ref={wrapRef}>
      {!hideIcon && <Search size={14} className="ss-icon" />}
      <input
        ref={inputRef}
        type="text"
        className="ss-input"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        aria-label={rest['aria-label']}
        value={open ? query : selected ? String(selected[1]) : ''}
        placeholder={open ? (selected ? String(selected[1]) : 'Type to search…') : placeholder || blank || 'Type to search…'}
        onFocus={() => { setOpen(true); setActive(0); }}
        onClick={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={onKeyDown}
      />
      <ChevronDown size={14} className="ss-chevron" />
      {required && (
        <input className="ss-required" tabIndex={-1} aria-hidden="true" required value={value === null ? '' : String(value)} onChange={() => {}} />
      )}
      {open && box && (
        <div ref={listRef} className="ss-list" role="listbox" style={box}>
          {showBlank && (
            <div className={'ss-opt muted' + (active === 0 ? ' active' : '')} role="option"
              onMouseDown={e => { e.preventDefault(); commit(''); }}>{blank}</div>
          )}
          {filtered.map(([id, name], index) => {
            const position = index + (showBlank ? 1 : 0);
            return (
              <div key={id} role="option" aria-selected={String(id) === String(value)}
                className={'ss-opt' + (position === active ? ' active' : '') + (String(id) === String(value) ? ' picked' : '')}
                onMouseEnter={() => setActive(position)}
                onMouseDown={e => { e.preventDefault(); commit(id); }}>
                {name}
              </div>
            );
          })}
          {!filtered.length && <div className="ss-empty">No matches for “{query}”</div>}
        </div>
      )}
    </span>
  );
}
