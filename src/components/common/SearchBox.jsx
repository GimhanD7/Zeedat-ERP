import { Search } from 'lucide-react';

export function SearchBox({ value, onChange, placeholder, inputRef, onKeyDown }) {
  return (
    <label className="search-box">
      <Search size={18} />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        onKeyDown={onKeyDown}
      />
    </label>
  );
}
