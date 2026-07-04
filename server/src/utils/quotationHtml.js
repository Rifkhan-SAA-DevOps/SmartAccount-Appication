function money(value) {
  return `LKR ${Number(value || 0).toFixed(2)}`;
}

function date(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function buildQuotationHtml({ document, tenant, settings, type = 'quotation' }) {
  const isOrder = type === 'sales-order';
  const title = isOrder ? 'Sales Order' : 'Quotation / Estimate';
  const number = isOrder ? document.orderNo : document.quoteNo;
  const dateLabel = isOrder ? 'Order Date' : 'Issue Date';
  const expiryLabel = isOrder ? 'Expected Date' : 'Valid Until';
  const expiryValue = isOrder ? document.expectedDate : document.validUntil;
  const rows = document.items || [];
  const accent = settings?.invoiceAccentColor || '#7c3aed';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} ${escapeHtml(number)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Inter,Arial,sans-serif;margin:0;background:#f8fafc;color:#0f172a;padding:28px}.doc{max-width:920px;margin:auto;background:#fff;border-radius:24px;padding:34px;box-shadow:0 20px 70px rgba(15,23,42,.12)}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:4px solid ${accent};padding-bottom:22px}.brand h1{margin:0;font-size:30px}.brand p,.meta p,.customer p{margin:5px 0;color:#64748b}.badge{display:inline-block;background:${accent};color:#fff;border-radius:999px;padding:7px 12px;font-weight:800;font-size:12px;text-transform:uppercase}.meta{text-align:right}.meta h2{margin:8px 0;font-size:32px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:28px 0}.box{border:1px solid #e2e8f0;border-radius:18px;padding:18px;background:#f8fafc}.box h3{margin:0 0 10px;font-size:14px;text-transform:uppercase;color:#475569}table{width:100%;border-collapse:collapse;margin-top:12px}th{background:#f1f5f9;color:#475569;text-align:left;font-size:12px;text-transform:uppercase;padding:12px}td{border-bottom:1px solid #e2e8f0;padding:13px 12px;vertical-align:top}td.num,th.num{text-align:right}.totals{margin-left:auto;width:320px;margin-top:22px}.totals div{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #e2e8f0}.totals .grand{font-size:21px;font-weight:900;color:${accent}}.terms{margin-top:28px;border-top:1px solid #e2e8f0;padding-top:18px;color:#475569;white-space:pre-wrap}.print{position:fixed;right:20px;bottom:20px;border:0;background:${accent};color:#fff;border-radius:14px;padding:13px 18px;font-weight:900;cursor:pointer}@media print{body{background:#fff;padding:0}.doc{box-shadow:none;border-radius:0}.print{display:none}}
  </style>
</head>
<body>
  <button class="print" onclick="window.print()">Print / Save PDF</button>
  <main class="doc">
    <section class="top">
      <div class="brand">
        <h1>${escapeHtml(tenant?.name || settings?.legalName || 'SmartLedger')}</h1>
        <p>${escapeHtml(settings?.address || tenant?.email || '')}</p>
        <p>${escapeHtml([tenant?.phone, settings?.taxNumber ? `Tax: ${settings.taxNumber}` : null].filter(Boolean).join(' • '))}</p>
      </div>
      <div class="meta">
        <span class="badge">${escapeHtml(document.status || 'DRAFT')}</span>
        <h2>${escapeHtml(title)}</h2>
        <p><strong>No:</strong> ${escapeHtml(number)}</p>
        <p><strong>${dateLabel}:</strong> ${date(document.issueDate || document.orderDate)}</p>
        <p><strong>${expiryLabel}:</strong> ${date(expiryValue)}</p>
      </div>
    </section>

    <section class="grid">
      <div class="box customer">
        <h3>Customer</h3>
        <p><strong>${escapeHtml(document.customer?.name || 'Walk-in / not selected')}</strong></p>
        <p>${escapeHtml(document.customer?.phone || '')}</p>
        <p>${escapeHtml(document.customer?.email || '')}</p>
        <p>${escapeHtml(document.customer?.address || '')}</p>
      </div>
      <div class="box">
        <h3>Reference</h3>
        <p>${escapeHtml(document.title || document.notes || '-')}</p>
        ${document.crmLead ? `<p><strong>Lead:</strong> ${escapeHtml(document.crmLead.leadNo)} - ${escapeHtml(document.crmLead.title)}</p>` : ''}
      </div>
    </section>

    <table>
      <thead><tr><th>#</th><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Discount</th><th class="num">Total</th></tr></thead>
      <tbody>
        ${rows.map((item, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(item.description)}</td><td class="num">${Number(item.qty || 0).toFixed(3)}</td><td class="num">${money(item.unitPrice)}</td><td class="num">${money(item.discount)}</td><td class="num">${money(item.total)}</td></tr>`).join('')}
      </tbody>
    </table>

    <section class="totals">
      <div><span>Subtotal</span><strong>${money(document.subtotal)}</strong></div>
      <div><span>Discount</span><strong>${money(document.discount)}</strong></div>
      <div><span>Tax</span><strong>${money(document.tax)}</strong></div>
      <div class="grand"><span>Total</span><strong>${money(document.total)}</strong></div>
    </section>

    <section class="terms">
      <strong>Notes / Terms</strong>\n${escapeHtml([document.notes, document.terms].filter(Boolean).join('\n\n') || settings?.invoiceTerms || 'Thank you for your business.')}
    </section>
  </main>
</body>
</html>`;
}
