import { useEffect, useMemo, useState } from 'react';
import Pagination from './Pagination.jsx';

export default function DataTable({
  columns = [],
  rows = [],
  empty = 'No data found',
  pageSize = 10,
  pagination = true
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safePageSize = Math.max(1, Number(pageSize || 10));
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(safeRows.length / safePageSize));

  useEffect(() => {
    setPage(1);
  }, [safeRows.length, safePageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleRows = useMemo(() => {
    if (!pagination || safeRows.length <= safePageSize) return safeRows;
    const start = (page - 1) * safePageSize;
    return safeRows.slice(start, start + safePageSize);
  }, [pagination, safeRows, safePageSize, page]);

  return (
    <div className="table-card">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {visibleRows.length ? visibleRows.map((row, index) => (
              <tr key={row.id || `${page}-${index}`}>
                {columns.map((column) => (
                  <td key={column.key} data-label={column.label}>
                    {column.render ? column.render(row, index) : row[column.key]}
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={Math.max(1, columns.length)} className="empty-cell">{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pagination && safeRows.length > safePageSize && (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={safeRows.length}
          pageSize={safePageSize}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
