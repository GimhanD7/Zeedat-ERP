import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Empty } from '../feedback/Empty';

export function Table({
  columns,
  rows,
  onRow,
  empty,
  pageSize: initialPageSize = 20,
  paginate = true,
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalRows = rows?.length || 0;
  const showPagination = paginate && totalRows > 10;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  // Clamp page when rows shrink (e.g. search/filter changes)
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [totalRows, totalPages, page]);

  // Reset to page 1 when the dataset length changes significantly
  useEffect(() => {
    setPage(1);
  }, [totalRows]);

  const pagedRows = useMemo(() => {
    if (!rows || !rows.length) return [];
    if (!showPagination) return rows;
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, showPagination, page, pageSize]);

  if (!rows || !rows.length) return <Empty>{empty}</Empty>;

  const startItem = showPagination ? (page - 1) * pageSize + 1 : 1;
  const endItem = showPagination ? Math.min(page * pageSize, totalRows) : totalRows;

  // Compute visible page numbers with ellipsis
  const pageNumbers = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (page > 3) pageNumbers.push('...');
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (page < totalPages - 2) pageNumbers.push('...');
    pageNumbers.push(totalPages);
  }

  return (
    <div className="table-paginated-wrap">
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
            {pagedRows.map((row, index) => (
              <tr
                key={row.id ?? `${page}-${index}`}
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
                  <td key={label}>
                    {typeof render === 'function' ? render(row, index) : row[render]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="zk-pagination-bar">
          <div className="zk-pagination-info">
            <span>
              Showing <strong>{startItem}–{endItem}</strong> of <strong>{totalRows}</strong>
            </span>
            <select
              aria-label="Rows per page"
              className="zk-page-size-select"
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 20, 50, 100].map(sz => (
                <option key={sz} value={sz}>
                  {sz} / page
                </option>
              ))}
            </select>
          </div>

          <div className="zk-pagination-controls">
            <button
              type="button"
              className="zk-page-btn"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft size={15} />
              <span>Prev</span>
            </button>

            {pageNumbers.map((num, idx) =>
              num === '...' ? (
                <span key={`el-${idx}`} className="zk-page-ellipsis">
                  …
                </span>
              ) : (
                <button
                  key={num}
                  type="button"
                  className={`zk-page-btn ${page === num ? 'active' : ''}`}
                  onClick={() => setPage(num)}
                >
                  {num}
                </button>
              )
            )}

            <button
              type="button"
              className="zk-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <span>Next</span>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
