import { useMemo, useState } from 'react';

export function useClientPagination(rows = [], initialPageSize = 10) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(safeRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageRows = useMemo(() => safeRows.slice(startIndex, startIndex + pageSize), [safeRows, startIndex, pageSize]);

  function goToPage(nextPage) {
    setPage(Math.min(Math.max(1, Number(nextPage) || 1), totalPages));
  }

  function changePageSize(nextSize) {
    setPageSize(Number(nextSize) || initialPageSize);
    setPage(1);
  }

  return {
    rows: pageRows,
    pageRows,
    page: safePage,
    pageSize,
    totalPages,
    totalRows: safeRows.length,
    startIndex,
    endIndex: Math.min(startIndex + pageSize, safeRows.length),
    setPage: goToPage,
    goToPage,
    setPageSize: changePageSize,
    changePageSize
  };
}

export default function Pagination({
  page = 1,
  totalPages = 1,
  totalRows = 0,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50]
}) {
  const safeTotalPages = Math.max(1, Number(totalPages) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), safeTotalPages);
  const start = totalRows === 0 ? 0 : ((safePage - 1) * pageSize) + 1;
  const end = Math.min(safePage * pageSize, totalRows);

  return (
    <div className="pagination-bar">
      <div className="pagination-info">
        Showing <strong>{start}</strong> - <strong>{end}</strong> of <strong>{totalRows}</strong>
      </div>
      <div className="pagination-controls">
        {onPageSizeChange && (
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} aria-label="Rows per page">
            {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
        )}
        <button type="button" className="page-btn" onClick={() => onPageChange?.(1)} disabled={safePage <= 1}>First</button>
        <button type="button" className="page-btn" onClick={() => onPageChange?.(safePage - 1)} disabled={safePage <= 1}>Prev</button>
        <span className="page-now">{safePage} / {safeTotalPages}</span>
        <button type="button" className="page-btn" onClick={() => onPageChange?.(safePage + 1)} disabled={safePage >= safeTotalPages}>Next</button>
        <button type="button" className="page-btn" onClick={() => onPageChange?.(safeTotalPages)} disabled={safePage >= safeTotalPages}>Last</button>
      </div>
    </div>
  );
}
