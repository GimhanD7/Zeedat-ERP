export function Empty({ children = 'No records to display.' }) {
  return <div className="empty">{children}</div>;
}
