import { useEffect, useMemo, useState } from 'react';

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

export function useClientPagination(items = [], options = {}) {
  const {
    initialPageSize = 10,
    resetKey = '',
    enabled = true
  } = options;

  const safeItems = Array.isArray(items) ? items : [];
  const safeInitialSize = Math.max(1, Number(initialPageSize || 10));
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(safeInitialSize);

  const totalItems = safeItems.length;
  const totalPages = enabled ? Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize))) : 1;

  useEffect(() => {
    setPageState(1);
  }, [resetKey, pageSize, enabled]);

  useEffect(() => {
    setPageState((current) => clamp(current, 1, totalPages));
  }, [totalPages]);

  const pageItems = useMemo(() => {
    if (!enabled) return safeItems;
    const startIndex = (page - 1) * pageSize;
    return safeItems.slice(startIndex, startIndex + pageSize);
  }, [enabled, safeItems, page, pageSize]);

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = enabled ? Math.min(totalItems, page * pageSize) : totalItems;

  return {
    page,
    setPage: (next) => setPageState((current) => clamp(typeof next === 'function' ? next(current) : next, 1, totalPages)),
    pageSize,
    setPageSize: (next) => setPageSizeState(Math.max(1, Number(next) || safeInitialSize)),
    totalItems,
    totalPages,
    pageItems,
    start,
    end,
    enabled
  };
}

export default function Pagination({
  page = 1,
  setPage,
  pageSize = 10,
  setPageSize,
  totalPages = 1,
  totalItems = 0,
  start,
  end,
  label = 'records',
  pageSizeOptions = [5, 10, 20, 50],
  onPageChange
}) {
  const safeTotalPages = Math.max(1, Number(totalPages || 1));
  const safePageSize = Math.max(1, Number(pageSize || 10));
  const safePage = clamp(page, 1, safeTotalPages);
  const safeTotalItems = Math.max(0, Number(totalItems || 0));
  const firstItem = start ?? (safeTotalItems ? ((safePage - 1) * safePageSize) + 1 : 0);
  const lastItem = end ?? Math.min(safeTotalItems, safePage * safePageSize);

  function changePage(nextPage) {
    const value = clamp(nextPage, 1, safeTotalPages);
    if (onPageChange) {
      onPageChange(value);
      return;
    }
    if (setPage) setPage(value);
  }

  function changePageSize(event) {
    const value = Math.max(1, Number(event.target.value) || safePageSize);
    if (setPageSize) setPageSize(value);
  }

  if (!safeTotalItems || safeTotalPages <= 1) return null;

  const pages = [];
  const firstPage = Math.max(1, safePage - 2);
  const lastPage = Math.min(safeTotalPages, safePage + 2);
  for (let item = firstPage; item <= lastPage; item += 1) pages.push(item);

  return (
    <div className="pagination-bar" role="navigation" aria-label="Table pagination">
      <div className="pagination-summary pagination-info">
        Showing <strong>{firstItem}</strong>–<strong>{lastItem}</strong> of <strong>{safeTotalItems}</strong> {label}
      </div>

      <div className="pagination-controls">
        {setPageSize && (
          <label className="pagination-size">
            Rows
            <select value={safePageSize} onChange={changePageSize}>
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}

        <button type="button" onClick={() => changePage(1)} disabled={safePage <= 1}>First</button>
        <button type="button" onClick={() => changePage(safePage - 1)} disabled={safePage <= 1}>Prev</button>
        {firstPage > 1 && <span className="pagination-dots">…</span>}
        {pages.map((item) => (
          <button
            type="button"
            key={item}
            className={item === safePage ? 'active' : ''}
            onClick={() => changePage(item)}
            disabled={item === safePage}
          >
            {item}
          </button>
        ))}
        {lastPage < safeTotalPages && <span className="pagination-dots">…</span>}
        <button type="button" onClick={() => changePage(safePage + 1)} disabled={safePage >= safeTotalPages}>Next</button>
        <button type="button" onClick={() => changePage(safeTotalPages)} disabled={safePage >= safeTotalPages}>Last</button>
      </div>
    </div>
  );
}
