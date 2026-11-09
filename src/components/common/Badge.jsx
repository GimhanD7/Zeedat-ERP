export function Badge({ children, tone }) {
  const color =
    tone ||
    (['Completed', 'Delivered', 'Available', 'Active', 'Ready', 'Open', 'Received'].includes(
      children
    )
      ? 'green'
      : ['Pending', 'Waiting for Parts', 'Low Stock', 'Inspection', 'Requested'].includes(children)
        ? 'amber'
        : ['Rejected', 'Cancelled', 'Out of Stock', 'Inactive'].includes(children)
          ? 'red'
          : 'blue');

  return <span className={'badge ' + color}>{children}</span>;
}
