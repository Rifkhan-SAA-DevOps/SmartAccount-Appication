import { useClientPagination } from './Pagination.jsx';
import Pagination from './Pagination.jsx';

function cellValue(row, column) {
  if (column.render) return column.render(row);
  const value = row?.[column.key];
  if (value === null || value === undefined || value === '') return '-';
  return value;
}

export default function DataTable({
  columns = [],
  rows = [],
  empty = 'No data found',
  onRowClick,
  rowKey = 'id',
  pageSize = 10,
  enablePagination = true,
  className = ''
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const pager = useClientPagination(safeRows, pageSize);
  const visibleRows = enablePagination ? pager.pageRows : safeRows;

  return (
    <div className={`table-card smart-table-card ${className}`}>
      <div className="smart-table-wrap">
        <table className="smart-data-table">
          <thead>
            <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {visibleRows.length ? visibleRows.map((row, i) => (
              <tr
                key={row?.[rowKey] || row?.id || i}
                className={onRowClick ? 'clickable-row' : ''}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
              >
                {columns.map((c) => <td key={c.key} data-label={c.label}>{cellValue(row, c)}</td>)}
              </tr>
            )) : <tr><td colSpan={Math.max(columns.length, 1)} className="empty-cell">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
      {enablePagination && safeRows.length > pageSize && (
        <Pagination
          page={pager.page}
          totalPages={pager.totalPages}
          totalRows={pager.totalRows}
          pageSize={pager.pageSize}
          onPageChange={pager.goToPage}
          onPageSizeChange={pager.changePageSize}
        />
      )}
    </div>
  );
}
