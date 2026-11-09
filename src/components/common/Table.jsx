import { Empty } from '../feedback/Empty';

export function Table({ columns, rows, onRow, empty }) {
  if (!rows || !rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(([label]) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id ?? index}
              className={onRow ? 'clickable' : ''}
              onClick={onRow ? () => onRow(row) : undefined}
              onKeyDown={
                onRow
                  ? e => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onRow(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onRow ? 0 : undefined}
            >
              {columns.map(([label, render]) => (
                <td key={label}>{typeof render === 'function' ? render(row, index) : row[render]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
