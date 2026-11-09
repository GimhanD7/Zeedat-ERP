export function FilterTabs({ choices, value, onChange }) {
  return (
    <div className="tabs" role="group" aria-label="Filters">
      {choices.map(item => {
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
