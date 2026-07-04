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

function periodLabel(statement) {
  if (statement.from && statement.to) return `${date(statement.from)} to ${date(statement.to)}`;
  if (statement.from) return `From ${date(statement.from)}`;
  if (statement.to) return `Up to ${date(statement.to)}`;
  return 'All time';
}

export function buildStatementHtml({ statement, tenant, settings }) {
  const accent = settings?.invoiceAccentColor || '#7c3aed';
  const companyName = settings?.legalName || tenant?.name || 'Company';
  const address = settings?.address || '';
  const currency = tenant?.currency || 'LKR';
  const party = statement.party || {};
  const title = statement.partyType === 'SUPPLIER' ? 'SUPPLIER STATEMENT' : 'CUSTOMER STATEMENT';
  const balanceLabel = statement.partyType === 'SUPPLIER' ? 'Payable Balance' : 'Outstanding Balance';
  const entries = statement.entries || [];

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} - ${esc(party.name || 'Party')}</title>
<style>
  *{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#1f2937;font-family:Inter,Arial,sans-serif}.paper{width:min(980px,100%);margin:28px auto;background:#fff;border-radius:22px;box-shadow:0 22px 70px rgba(15,23,42,.12);overflow:hidden}.top{padding:34px 40px;background:linear-gradient(135deg,${accent},#111827);color:white;display:flex;justify-content:space-between;gap:24px}.brand{display:flex;gap:16px;align-items:center}.logo{width:72px;height:72px;border-radius:18px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);display:grid;place-items:center;overflow:hidden;font-size:28px;font-weight:900}.logo img{width:100%;height:100%;object-fit:cover}.brand h1{margin:0 0 8px;font-size:28px}.brand p{margin:4px 0;color:rgba(255,255,255,.86);line-height:1.45}.statement-title{text-align:right}.statement-title h2{font-size:34px;letter-spacing:1px;margin:0}.statement-title p{margin:8px 0;color:rgba(255,255,255,.88)}.content{padding:34px 40px}.meta{display:grid;grid-template-columns:1.2fr .8fr;gap:24px;margin-bottom:24px}.box{border:1px solid #e5e7eb;border-radius:18px;padding:18px;background:#fff}.box h3{margin:0 0 12px;color:${accent};font-size:14px;text-transform:uppercase;letter-spacing:.08em}.box p{margin:6px 0;color:#4b5563}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:0 0 26px}.summary div{border:1px solid #e5e7eb;border-radius:16px;padding:16px;background:linear-gradient(135deg,#fff,#faf9ff)}.summary span{display:block;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase}.summary strong{display:block;font-size:19px;margin-top:8px;color:#111827}.summary div:last-child strong{color:${accent}}.items{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden}.items th{background:#f8fafc;color:#64748b;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.items th,.items td{padding:12px 14px;border-bottom:1px solid #e5e7eb}.items td:nth-child(4),.items td:nth-child(5),.items td:nth-child(6){text-align:right}.items tr:last-child td{border-bottom:0}.footer{padding:18px 40px;background:#f8fafc;color:#64748b;text-align:center}.screen-actions{position:sticky;top:0;z-index:4;background:rgba(255,255,255,.9);backdrop-filter:blur(12px);border-bottom:1px solid #e5e7eb;padding:12px;text-align:center}.screen-actions button{border:0;border-radius:999px;padding:12px 18px;background:${accent};color:white;font-weight:900;cursor:pointer}.note{margin-top:22px;color:#64748b;line-height:1.55}.empty{text-align:center;color:#64748b;padding:30px}
  @media(max-width:760px){.paper{margin:0;border-radius:0}.top,.meta{display:grid}.statement-title{text-align:left}.content,.top,.footer{padding:22px}.summary{grid-template-columns:1fr 1fr}.items{font-size:13px}.items th,.items td{padding:10px}}
  @media print{body{background:white}.screen-actions{display:none}.paper{margin:0;width:100%;box-shadow:none;border-radius:0}.top{-webkit-print-color-adjust:exact;print-color-adjust:exact}.summary div{-webkit-print-color-adjust:exact;print-color-adjust:exact}.footer{position:fixed;bottom:0;left:0;right:0}}
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
      <div class="statement-title">
        <h2>${esc(title)}</h2>
        <p><b>${esc(party.name || '-')}</b></p>
        <p>${esc(periodLabel(statement))}</p>
      </div>
    </section>
    <section class="content">
      <div class="meta">
        <div class="box">
          <h3>${statement.partyType === 'SUPPLIER' ? 'Supplier' : 'Customer'} Details</h3>
          <p><b>${esc(party.name || '-')}</b></p>
          ${party.phone ? `<p>Phone: ${esc(party.phone)}</p>` : ''}
          ${party.email ? `<p>Email: ${esc(party.email)}</p>` : ''}
          ${party.address ? `<p>${esc(party.address).replace(/\n/g, '<br/>')}</p>` : ''}
        </div>
        <div class="box">
          <h3>Statement Details</h3>
          <p><b>Generated:</b> ${date(statement.generatedAt)}</p>
          <p><b>Period:</b> ${esc(periodLabel(statement))}</p>
          <p><b>${esc(balanceLabel)}:</b> ${money(statement.closingBalance, currency)}</p>
        </div>
      </div>
      <div class="summary">
        <div><span>Opening Balance</span><strong>${money(statement.openingBalance, currency)}</strong></div>
        <div><span>Total Debit</span><strong>${money(statement.totalDebit, currency)}</strong></div>
        <div><span>Total Credit</span><strong>${money(statement.totalCredit, currency)}</strong></div>
        <div><span>Closing Balance</span><strong>${money(statement.closingBalance, currency)}</strong></div>
      </div>
      <table class="items">
        <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
        <tbody>
          ${entries.length ? entries.map((entry) => `<tr><td>${date(entry.date)}</td><td>${esc(entry.type)}</td><td><b>${esc(entry.ref || '-')}</b><br/>${esc(entry.description || '')}</td><td>${money(entry.debit, currency)}</td><td>${money(entry.credit, currency)}</td><td>${money(entry.balance, currency)}</td></tr>`).join('') : `<tr><td class="empty" colspan="6">No transactions for this period.</td></tr>`}
        </tbody>
      </table>
      <p class="note">This statement was generated from posted invoices, GRNs, returns, and payment receipts recorded in SmartLedger.</p>
    </section>
    <footer class="footer">${esc(settings?.invoiceFooter || 'Thank you for your business.')}</footer>
  </main>
</body>
</html>`;
}
