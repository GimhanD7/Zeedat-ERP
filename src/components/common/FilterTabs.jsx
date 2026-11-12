export function FilterTabs({ choices, options, value, onChange }) {
  const list = choices || options || [];
  return (
    <div className="tabs" role="group" aria-label="Filters">
      {list.map(item => {
        const [key, label] = Array.isArray(item) ? item : [item, item];
        return (
          <button
            key={key}
            className={key === value ? 'selected' : ''}
            type="button"
            aria-pressed={key === value}
            onClick={() => onChange(key)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
