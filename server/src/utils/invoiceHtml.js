function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(value, currency = 'LKR') {
  return `${esc(currency)} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function date(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

export function buildInvoiceHtml({ invoice, tenant, settings }) {
  const accent = settings?.invoiceAccentColor || '#7c3aed';
  const companyName = settings?.legalName || tenant?.name || 'Company';
  const address = settings?.address || '';
  const currency = tenant?.currency || 'LKR';
  const items = invoice.items || [];
  const customer = invoice.customer;
  const taxLabel = Number(invoice.tax || 0) > 0 ? 'Tax' : 'Tax';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(invoice.invoiceNo)} - Invoice</title>
<style>
  *{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#1f2937;font-family:Inter,Arial,sans-serif}.paper{width:min(920px,100%);margin:28px auto;background:#fff;border-radius:22px;box-shadow:0 22px 70px rgba(15,23,42,.12);overflow:hidden}.top{padding:34px 40px;background:linear-gradient(135deg,${accent},#111827);color:white;display:flex;justify-content:space-between;gap:24px}.brand{display:flex;gap:16px;align-items:center}.logo{width:72px;height:72px;border-radius:18px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);display:grid;place-items:center;overflow:hidden;font-size:28px;font-weight:900}.logo img{width:100%;height:100%;object-fit:cover}.brand h1{margin:0 0 8px;font-size:28px}.brand p{margin:4px 0;color:rgba(255,255,255,.86);line-height:1.45}.inv-title{text-align:right}.inv-title h2{font-size:42px;letter-spacing:2px;margin:0}.inv-title p{margin:8px 0;color:rgba(255,255,255,.88)}.content{padding:34px 40px}.meta{display:grid;grid-template-columns:1.2fr .8fr;gap:24px;margin-bottom:28px}.box{border:1px solid #e5e7eb;border-radius:18px;padding:18px;background:#fff}.box h3{margin:0 0 12px;color:${accent};font-size:14px;text-transform:uppercase;letter-spacing:.08em}.box p{margin:6px 0;color:#4b5563}.meta-table{width:100%;border-collapse:collapse}.meta-table td{padding:7px 0;border-bottom:1px dashed #e5e7eb}.meta-table td:last-child{text-align:right;font-weight:800;color:#111827}.items{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden}.items th{background:#f8fafc;color:#64748b;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.items th,.items td{padding:14px;border-bottom:1px solid #e5e7eb}.items td:nth-child(3),.items td:nth-child(4),.items td:nth-child(5){text-align:right}.items tr:last-child td{border-bottom:0}.totals{display:flex;justify-content:flex-end;margin-top:24px}.totals table{width:360px;border-collapse:collapse}.totals td{padding:10px 0;border-bottom:1px solid #e5e7eb}.totals td:last-child{text-align:right;font-weight:900}.totals .grand td{font-size:20px;color:${accent};border-bottom:0;padding-top:14px}.notes{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:28px}.footer{padding:18px 40px;background:#f8fafc;color:#64748b;text-align:center}.screen-actions{position:sticky;top:0;z-index:4;background:rgba(255,255,255,.9);backdrop-filter:blur(12px);border-bottom:1px solid #e5e7eb;padding:12px;text-align:center}.screen-actions button{border:0;border-radius:999px;padding:12px 18px;background:${accent};color:white;font-weight:900;cursor:pointer}
  @media(max-width:700px){.paper{margin:0;border-radius:0}.top,.meta,.notes{display:grid}.inv-title{text-align:left}.content,.top,.footer{padding:22px}.items{font-size:13px}.items th,.items td{padding:10px}.totals table{width:100%}}
  @media print{body{background:white}.screen-actions{display:none}.paper{margin:0;width:100%;box-shadow:none;border-radius:0}.top{-webkit-print-color-adjust:exact;print-color-adjust:exact}.footer{position:fixed;bottom:0;left:0;right:0}}
</style>
</head>
<body>
  <div class="screen-actions"><button onclick="window.print()">Print / Save as PDF</button></div>
  <main class="paper">
    <section class="top">
      <div class="brand">
        <div class="logo">${settings?.showLogo && tenant?.logoUrl ? `<img src="${esc(tenant.logoUrl)}" alt="logo" />` : esc(companyName.charAt(0).toUpperCase())}</div>
        <div>
          <h1>${esc(companyName)}</h1>
          ${address ? `<p>${esc(address).replace(/\n/g, '<br/>')}</p>` : ''}
          <p>${tenant?.phone ? `Phone: ${esc(tenant.phone)}` : ''}${tenant?.email ? ` &nbsp; Email: ${esc(tenant.email)}` : ''}</p>
          ${settings?.showTaxNumber && settings?.taxNumber ? `<p>Tax No: ${esc(settings.taxNumber)}</p>` : ''}
        </div>
      </div>
      <div class="inv-title">
        <h2>INVOICE</h2>
        <p><b>${esc(invoice.invoiceNo)}</b></p>
        <p>Status: ${esc(invoice.status)}</p>
      </div>
    </section>
    <section class="content">
      <div class="meta">
        <div class="box">
          <h3>Bill To</h3>
          <p><b>${esc(customer?.name || 'Walk-in Customer')}</b></p>
          ${customer?.phone ? `<p>Phone: ${esc(customer.phone)}</p>` : ''}
          ${customer?.email ? `<p>Email: ${esc(customer.email)}</p>` : ''}
          ${customer?.address ? `<p>${esc(customer.address).replace(/\n/g, '<br/>')}</p>` : ''}
        </div>
        <div class="box">
          <h3>Invoice Details</h3>
          <table class="meta-table">
            <tr><td>Invoice Date</td><td>${date(invoice.issueDate)}</td></tr>
            <tr><td>Due Date</td><td>${date(invoice.dueDate)}</td></tr>
            <tr><td>Created By</td><td>${esc(invoice.createdBy?.name || '-')}</td></tr>
          </table>
        </div>
      </div>
      <table class="items">
        <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
        <tbody>
          ${items.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.description)}</td><td>${Number(item.qty || 0)}</td><td>${money(item.unitPrice, currency)}</td><td>${money(item.total, currency)}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="totals">
        <table>
          <tr><td>Subtotal</td><td>${money(invoice.subtotal, currency)}</td></tr>
          <tr><td>Discount</td><td>${money(invoice.discount, currency)}</td></tr>
          <tr><td>${taxLabel}</td><td>${money(invoice.tax, currency)}</td></tr>
          <tr class="grand"><td>Total</td><td>${money(invoice.total, currency)}</td></tr>
          <tr><td>Paid</td><td>${money(invoice.paid, currency)}</td></tr>
          <tr><td>Balance</td><td>${money(invoice.balance, currency)}</td></tr>
        </table>
      </div>
      <div class="notes">
        <div class="box"><h3>Terms</h3><p>${esc(settings?.invoiceTerms || 'Payment is due according to the agreed terms.').replace(/\n/g, '<br/>')}</p></div>
        <div class="box"><h3>Notes</h3><p>${esc(invoice.notes || settings?.invoiceFooter || 'Thank you for your business.').replace(/\n/g, '<br/>')}</p></div>
      </div>
    </section>
    <footer class="footer">${esc(settings?.invoiceFooter || 'Thank you for your business.')}</footer>
  </main>
</body>
</html>`;
}
