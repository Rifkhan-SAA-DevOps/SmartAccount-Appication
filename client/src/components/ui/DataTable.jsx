import { useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import PaginationBar, { useClientPagination } from './Pagination.jsx';
import ModalDrawer from './ModalDrawer.jsx';
import '../../styles/table-row-modal-stage16.css';

function shouldIgnoreRowClick(event) {
  return Boolean(event.target.closest('button, a, input, select, textarea, label, [data-stop-row-click="true"]'));
}

function isActionColumn(column = {}) {
  const key = String(column.key || '').toLowerCase();
  const label = String(column.label || '').toLowerCase();
  return key.includes('action') || label === 'action' || label === 'actions';
}

function toTitle(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isEmptyValue(value) {
  return value === null || value === undefined || value === '';
}

function formatRawValue(value) {
  if (isEmptyValue(value)) return <span className="muted">—</span>;
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : String(value);
  if (typeof value === 'object') {
    if (value?.props) return value;
    try {
      return <pre className="row-modal-json">{JSON.stringify(value, null, 2)}</pre>;
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function getBestTitle(row, columns) {
  const titleKeys = ['name', 'title', 'invoiceNo', 'invoiceNumber', 'number', 'code', 'referenceNo', 'reference', 'chequeNo', 'employeeNo', 'assetNo', 'sku'];
  for (const key of titleKeys) {
    if (!isEmptyValue(row?.[key])) return String(row[key]);
  }
  const firstColumn = columns.find((column) => !isActionColumn(column));
  if (firstColumn?.key && !isEmptyValue(row?.[firstColumn.key])) return String(row[firstColumn.key]);
  return 'Record details';
}

function buildModalFields(row, columns, actualIndex, rowModalFields) {
  if (Array.isArray(rowModalFields) && rowModalFields.length) {
    return rowModalFields.map((field) => {
      if (typeof field === 'string') {
        return {
          key: field,
          label: toTitle(field),
          value: formatRawValue(row?.[field])
        };
      }
      const value = field.render ? field.render(row, actualIndex) : row?.[field.key];
      return {
        key: field.key || field.label,
        label: field.label || toTitle(field.key),
        value: isEmptyValue(value) ? <span className="muted">—</span> : value
      };
    });
  }

  const visibleColumnFields = columns
    .filter((column) => !isActionColumn(column))
    .map((column) => {
      const value = column.render ? column.render(row, actualIndex) : row?.[column.key];
      return {
        key: column.key,
        label: column.label || toTitle(column.key),
        value: isEmptyValue(value) ? <span className="muted">—</span> : value
      };
    });

  if (visibleColumnFields.length) return visibleColumnFields;

  return Object.keys(row || {})
    .filter((key) => !key.toLowerCase().includes('password'))
    .slice(0, 40)
    .map((key) => ({ key, label: toTitle(key), value: formatRawValue(row[key]) }));
}

function DefaultRowDetails({ row, columns, actualIndex, rowModalFields, rowModalActions }) {
  const fields = buildModalFields(row, columns, actualIndex, rowModalFields);

  return (
    <div className="row-modal-content">
      <div className="row-modal-summary">
        <div className="row-modal-summary-icon"><Eye size={20} /></div>
        <div>
          <strong>Record overview</strong>
          <p>Review the selected row details here. Table actions should be handled from this view when the page provides them.</p>
        </div>
      </div>

      <div className="row-modal-field-grid">
        {fields.map((field) => (
          <div className="row-modal-field" key={field.key || field.label}>
            <span>{field.label}</span>
            <div>{field.value}</div>
          </div>
        ))}
      </div>

      {rowModalActions && <div className="row-modal-actions">{typeof rowModalActions === 'function' ? rowModalActions(row, actualIndex) : rowModalActions}</div>}
    </div>
  );
}

export default function DataTable({
  columns = [],
  rows,
  data,
  empty = 'No data found',
  emptyTitle,
  emptyDescription,
  emptyAction,
  className = '',
  pagination = true,
  pageSize = 10,
  pageSizeOptions = [5, 10, 20, 50],
  paginationLabel = 'records',
  onRowClick,
  rowClassName,
  getRowKey,
  clickableRows = true,
  rowModal = true,
  rowModalTitle,
  rowModalEyebrow = 'Selected record',
  rowModalDescription = 'Details from the row you selected.',
  rowModalSize = 'lg',
  rowModalMode = 'modal',
  rowModalFields,
  rowModalActions,
  renderRowModal
}) {
  const safeRows = Array.isArray(rows) ? rows : Array.isArray(data) ? data : [];
  const safeColumns = Array.isArray(columns) ? columns : [];
  const [selectedRowState, setSelectedRowState] = useState(null);

  const pager = useClientPagination(safeRows, {
    initialPageSize: pageSize,
    resetKey: `${safeRows.length}-${safeColumns.map((column) => column.key).join('|')}`,
    enabled: pagination
  });

  const visibleRows = pagination ? pager.pageItems : safeRows;
  const hasManualClick = typeof onRowClick === 'function';
  const hasAutoModal = rowModal !== false && clickableRows !== false;
  const clickable = hasManualClick || hasAutoModal;

  const modalTitle = useMemo(() => {
    if (!selectedRowState?.row) return 'Record details';
    if (typeof rowModalTitle === 'function') return rowModalTitle(selectedRowState.row, selectedRowState.actualIndex);
    if (rowModalTitle) return rowModalTitle;
    return getBestTitle(selectedRowState.row, safeColumns);
  }, [selectedRowState, rowModalTitle, safeColumns]);

  function openRow(row, actualIndex) {
    if (hasManualClick) {
      onRowClick(row, actualIndex);
      return;
    }
    if (hasAutoModal) setSelectedRowState({ row, actualIndex });
  }

  function handleRowKeyDown(event, row, actualIndex) {
    if (!clickable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openRow(row, actualIndex);
    }
  }

  return (
    <>
      <div className={`table-card data-table-card ${className}`.trim()}>
        <div className="data-table-scroll" tabIndex={0} aria-label="Scrollable table area">
          <table className="data-table">
            <thead>
              <tr>{safeColumns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {visibleRows.length ? visibleRows.map((row, rowIndex) => {
                const actualIndex = pagination ? pager.start + rowIndex - 1 : rowIndex;
                const dynamicClass = typeof rowClassName === 'function' ? rowClassName(row, actualIndex) : rowClassName || '';
                return (
                  <tr
                    key={getRowKey ? getRowKey(row, actualIndex) : row?.id || `${pager.start}-${rowIndex}`}
                    className={`${clickable ? 'clickable-row row-modal-enabled' : ''} ${dynamicClass}`.trim()}
                    onClick={(event) => {
                      if (clickable && !shouldIgnoreRowClick(event)) openRow(row, actualIndex);
                    }}
                    onKeyDown={(event) => handleRowKeyDown(event, row, actualIndex)}
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? 'button' : undefined}
                    title={clickable ? 'Click to view details' : undefined}
                  >
                    {safeColumns.map((column) => {
                      const value = column.render ? column.render(row, actualIndex) : row?.[column.key];
                      return (
                        <td key={column.key} data-label={column.label}>
                          {value === null || value === undefined || value === '' ? <span className="muted">—</span> : value}
                        </td>
                      );
                    })}
                  </tr>
                );
              }) : (
                <tr className="data-table-empty-row">
                  <td colSpan={Math.max(safeColumns.length, 1)} className="empty-cell">
                    <div className="smart-empty-state">
                      <div className="smart-empty-icon">⌁</div>
                      <strong>{emptyTitle || empty}</strong>
                      {emptyDescription && <p>{emptyDescription}</p>}
                      {emptyAction && <div className="smart-empty-action">{emptyAction}</div>}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pagination && (
          <PaginationBar
            page={pager.page}
            setPage={pager.setPage}
            pageSize={pager.pageSize}
            setPageSize={pager.setPageSize}
            totalPages={pager.totalPages}
            totalItems={pager.totalItems}
            start={pager.start}
            end={pager.end}
            label={paginationLabel}
            pageSizeOptions={pageSizeOptions}
          />
        )}
      </div>

      <ModalDrawer
        open={Boolean(selectedRowState)}
        mode={rowModalMode}
        size={rowModalSize}
        title={modalTitle}
        eyebrow={rowModalEyebrow}
        description={rowModalDescription}
        onClose={() => setSelectedRowState(null)}
        className="table-row-detail-modal"
      >
        {selectedRowState && (
          renderRowModal ? renderRowModal(selectedRowState.row, selectedRowState.actualIndex, () => setSelectedRowState(null)) : (
            <DefaultRowDetails
              row={selectedRowState.row}
              columns={safeColumns}
              actualIndex={selectedRowState.actualIndex}
              rowModalFields={rowModalFields}
              rowModalActions={rowModalActions}
            />
          )
        )}
      </ModalDrawer>
    </>
  );
}
