export function Field({ label, children, full = false }) {
  return (
    <label className={'field ' + (full ? 'full' : '')}>
      <span>{label}</span>
      {children}
    </label>
  );
}
