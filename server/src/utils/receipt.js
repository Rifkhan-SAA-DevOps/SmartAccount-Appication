export async function nextReceiptNo(tx, tenantId) {
  const [count, settings] = await Promise.all([
    tx.payment.count({ where: { tenantId } }),
    tx.tenantSetting.findUnique({ where: { tenantId } }).catch(() => null)
  ]);
  const prefix = settings?.receiptPrefix || 'RCPT';
  return `${prefix}${String(count + 1001).padStart(4, '0')}`;
}
