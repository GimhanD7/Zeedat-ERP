export function Stats({ items }) {
  return (
    <div className="stats">
      {items.map(({ icon: Icon, label, value, note, tone = 'teal' }) => (
        <div className="stat" key={label}>
          <span className={'stat-icon ' + tone}>
            <Icon size={22} strokeWidth={1.9} />
          </span>
          <div>
            <div className="stat-label">{label}</div>
            <strong>{value}</strong>
            <div className="stat-note">{note}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
