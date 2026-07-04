function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

export function buildThermalReceiptHtml({ invoice, tenant, settings }) {
  const businessName = settings?.legalName || tenant?.name || 'SmartLedger Business';
  const address = settings?.address || '';
  const taxNumber = settings?.showTaxNumber ? settings?.taxNumber : '';
  const lines = invoice.items || [];
  const paid = Number(invoice.paid || 0);
  const total = Number(invoice.total || 0);
  const tenderedMatch = String(invoice.notes || '').match(/tendered=([0-9.]+)/i);
  const changeMatch = String(invoice.notes || '').match(/change=([0-9.]+)/i);
  const tendered = tenderedMatch ? Number(tenderedMatch[1]) : paid;
  const balance = Math.max(total - paid, 0);
  const change = changeMatch ? Number(changeMatch[1]) : Math.max(tendered - total, 0);
  const paymentMethod = invoice.payments?.[0]?.method || (paid > 0 ? 'CASH' : 'CREDIT');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${esc(invoice.invoiceNo)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #111827; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 11px; }
    .receipt { width: 72mm; margin: 0 auto; }
    .center { text-align: center; }
    .business { font-size: 16px; font-weight: 900; letter-spacing: .2px; }
    .muted { color: #4b5563; font-size: 10px; }
    .line { border-top: 1px dashed #111827; margin: 7px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
    .row strong { font-weight: 800; }
    .items { width: 100%; border-collapse: collapse; }
    .items th { text-align: left; border-bottom: 1px dashed #111827; padding: 3px 0; }
    .items td { padding: 3px 0; vertical-align: top; }
    .items .num { text-align: right; white-space: nowrap; }
    .total { font-size: 14px; font-weight: 900; }
    .barcode-text { font-size: 13px; font-weight: 900; letter-spacing: 2px; margin-top: 8px; }
    .actions { margin: 14px 0; text-align: center; }
    .actions button { border: 0; border-radius: 8px; padding: 10px 14px; background: #111827; color: #fff; cursor: pointer; }
    @media print { .actions { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <div class="business">${esc(businessName)}</div>
      ${address ? `<div class="muted">${esc(address)}</div>` : ''}
      ${taxNumber ? `<div class="muted">Tax No: ${esc(taxNumber)}</div>` : ''}
      <div class="muted">${esc(tenant?.phone || '')}</div>
    </div>

    <div class="line"></div>
    <div class="row"><span>Receipt</span><strong>${esc(invoice.invoiceNo)}</strong></div>
    <div class="row"><span>Date</span><strong>${esc(new Date(invoice.createdAt || Date.now()).toLocaleString())}</strong></div>
    <div class="row"><span>Cashier</span><strong>${esc(invoice.createdBy?.name || 'System')}</strong></div>
    <div class="row"><span>Customer</span><strong>${esc(invoice.customer?.name || 'Walk-in')}</strong></div>
    <div class="line"></div>

    <table class="items">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Total</th></tr></thead>
      <tbody>
        ${lines.map((item) => `<tr>
          <td>${esc(item.description || item.product?.name || 'Item')}<br><span class="muted">${esc(item.product?.barcode || item.product?.sku || '')} @ ${money(item.unitPrice)}</span></td>
          <td class="num">${money(item.qty)}</td>
          <td class="num">${money(item.total)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="line"></div>
    <div class="row"><span>Subtotal</span><strong>LKR ${money(invoice.subtotal)}</strong></div>
    <div class="row"><span>Discount</span><strong>LKR ${money(invoice.discount)}</strong></div>
    <div class="row"><span>Tax</span><strong>LKR ${money(invoice.tax)}</strong></div>
    <div class="row total"><span>Total</span><strong>LKR ${money(invoice.total)}</strong></div>
    <div class="row"><span>Paid (${esc(paymentMethod)})</span><strong>LKR ${money(invoice.paid)}</strong></div>
    <div class="row"><span>Tendered</span><strong>LKR ${money(tendered)}</strong></div>
    <div class="row"><span>Balance</span><strong>LKR ${money(balance)}</strong></div>
    <div class="row"><span>Change</span><strong>LKR ${money(change)}</strong></div>
    <div class="line"></div>

    <div class="center">
      <div>${esc(settings?.invoiceFooter || 'Thank you for your business.')}</div>
      <div class="barcode-text">* ${esc(invoice.invoiceNo)} *</div>
      <div class="muted">Powered by SmartLedger</div>
    </div>

    <div class="actions"><button onclick="window.print()">Print Receipt</button></div>
  </div>
  <script>
    window.onload = () => setTimeout(() => window.print(), 350);
  </script>
</body>
</html>`;
}
