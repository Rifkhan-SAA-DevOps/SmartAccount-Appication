import { useEffect, useState } from 'react';
import ModalDrawer from './ModalDrawer.jsx';
import '../../styles/raw-table-enhancer-stage17.css';

const IGNORE_CLICK_SELECTOR = 'button, a, input, select, textarea, label, [data-stop-row-click="true"], .pagination-bar, .raw-table-pagination';
const ENHANCED_ATTR = 'data-raw-table-enhanced';
const PAGE_SIZE = 10;

function normalise(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isActionHeader(label) {
  const value = normalise(label).toLowerCase();
  return value === 'action' || value === 'actions' || value === '';
}

function getHeaders(table) {
  const headerCells = Array.from(table.querySelectorAll('thead th'));
  if (headerCells.length) return headerCells.map((cell, index) => normalise(cell.textContent) || `Field ${index + 1}`);

  const firstRowCells = Array.from(table.querySelectorAll('tr:first-child th, tr:first-child td'));
  return firstRowCells.map((cell, index) => normalise(cell.textContent) || `Field ${index + 1}`);
}

function getBodyRows(table) {
  const bodies = Array.from(table.tBodies || []);
  if (bodies.length) return bodies.flatMap((body) => Array.from(body.rows || []));
  return Array.from(table.querySelectorAll('tr')).filter((row) => !row.closest('thead'));
}

function getRowData(table, row) {
  const headers = getHeaders(table);
  const cells = Array.from(row.cells || []);
  const fields = cells
    .map((cell, index) => ({
      label: headers[index] || `Field ${index + 1}`,
      value: normalise(cell.innerText || cell.textContent)
    }))
    .filter((field) => !isActionHeader(field.label) && field.value !== '');

  const titleCandidate = fields.find((field) => field.value && !/^[-–—]$/.test(field.value));
  const title = titleCandidate?.value || 'Record details';

  const tableTitle = table.getAttribute('aria-label')
    || table.closest('.table-card, .report-card, .panel, .card, section')?.querySelector('h1,h2,h3,strong')?.textContent
    || 'Selected table row';

  return {
    title: title.slice(0, 80),
    tableTitle: normalise(tableTitle),
    fields
  };
}

function getRouteKey() {
  return `${window.location.pathname}${window.location.search}`;
}

function shouldEnhanceTable(table) {
  if (!table || table.getAttribute(ENHANCED_ATTR) === 'true') return false;
  if (table.classList.contains('data-table')) return false;
  if (table.closest('.data-table-card')) return false;
  if (table.closest('.modal-drawer, .modal-drawer-shell, .row-modal-content, .raw-table-detail-modal')) return false;
  return getBodyRows(table).length > 0;
}

function clearOldPagination(table) {
  const next = table.nextElementSibling;
  if (next?.classList?.contains('raw-table-pagination')) next.remove();
}

function applyRawTablePagination(table, rows) {
  clearOldPagination(table);

  if (rows.length <= PAGE_SIZE) {
    rows.forEach((row) => { row.style.display = ''; });
    return;
  }

  let page = 1;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const controls = document.createElement('div');
  controls.className = 'raw-table-pagination';
  controls.setAttribute('data-stop-row-click', 'true');

  function render() {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    rows.forEach((row, index) => {
      row.style.display = index >= start && index < end ? '' : 'none';
    });

    controls.innerHTML = `
      <div class="raw-table-page-info">Showing <strong>${start + 1}</strong>–<strong>${Math.min(end, rows.length)}</strong> of <strong>${rows.length}</strong> records</div>
      <div class="raw-table-page-actions">
        <button type="button" data-page="first" ${page <= 1 ? 'disabled' : ''}>First</button>
        <button type="button" data-page="prev" ${page <= 1 ? 'disabled' : ''}>Prev</button>
        <span>Page <strong>${page}</strong> / ${totalPages}</span>
        <button type="button" data-page="next" ${page >= totalPages ? 'disabled' : ''}>Next</button>
        <button type="button" data-page="last" ${page >= totalPages ? 'disabled' : ''}>Last</button>
      </div>
    `;
  }

  controls.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-page]');
    if (!button) return;

    const action = button.getAttribute('data-page');
    if (action === 'first') page = 1;
    if (action === 'prev') page = Math.max(1, page - 1);
    if (action === 'next') page = Math.min(totalPages, page + 1);
    if (action === 'last') page = totalPages;
    render();
  });

  table.insertAdjacentElement('afterend', controls);
  render();
}

function enhanceOneTable(table, openRowModal) {
  if (!shouldEnhanceTable(table)) return;

  table.setAttribute(ENHANCED_ATTR, 'true');
  table.classList.add('raw-table-enhanced');

  const parent = table.parentElement;
  if (parent) parent.classList.add('raw-table-scroll-area');

  const rows = getBodyRows(table);
  rows.forEach((row) => {
    row.classList.add('raw-table-clickable-row');
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');
    row.setAttribute('title', 'Click to view details');
  });

  table.addEventListener('click', (event) => {
    if (event.target.closest(IGNORE_CLICK_SELECTOR)) return;
    const row = event.target.closest('tbody tr, tr');
    if (!row || row.closest('thead')) return;
    openRowModal(getRowData(table, row));
  });

  table.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tbody tr, tr');
    if (!row || row.closest('thead')) return;
    event.preventDefault();
    openRowModal(getRowData(table, row));
  });

  applyRawTablePagination(table, rows);
}

export default function RawTableEnhancer() {
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let lastRoute = getRouteKey();
    let scanTimer = null;

    function scan() {
      window.clearTimeout(scanTimer);
      scanTimer = window.setTimeout(() => {
        document.querySelectorAll('table').forEach((table) => enhanceOneTable(table, setSelected));
      }, 80);
    }

    scan();

    const observer = new MutationObserver(() => {
      const currentRoute = getRouteKey();
      if (currentRoute !== lastRoute) {
        lastRoute = currentRoute;
        setSelected(null);
      }
      scan();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('popstate', scan);
    window.addEventListener('hashchange', scan);

    return () => {
      window.clearTimeout(scanTimer);
      observer.disconnect();
      window.removeEventListener('popstate', scan);
      window.removeEventListener('hashchange', scan);
    };
  }, []);

  return (
    <ModalDrawer
      open={Boolean(selected)}
      onClose={() => setSelected(null)}
      title={selected?.title || 'Record details'}
      eyebrow={selected?.tableTitle || 'Table record'}
      description="Review the selected table row details here. Use page-specific action buttons where available."
      mode="modal"
      size="lg"
      className="raw-table-detail-modal"
    >
      {selected && (
        <div className="raw-row-modal-content">
          <div className="raw-row-modal-summary">
            <div className="raw-row-modal-icon">↗</div>
            <div>
              <strong>{selected.tableTitle || 'Selected record'}</strong>
              <p>This view is created from the row you clicked, so long tables stay clean and readable.</p>
            </div>
          </div>

          <div className="raw-row-modal-field-grid">
            {selected.fields.length ? selected.fields.map((field, index) => (
              <div className="raw-row-modal-field" key={`${field.label}-${index}`}>
                <span>{field.label}</span>
                <div>{field.value || '—'}</div>
              </div>
            )) : (
              <div className="smart-empty-state">
                <div className="smart-empty-icon">⌁</div>
                <strong>No row details found</strong>
                <p>This row does not contain readable table cells.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </ModalDrawer>
  );
}
