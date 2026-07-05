import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';

const emptySalesItem = { productId: '', description: '', qty: 1, unitPrice: 0, discount: 0 };
const emptyPurchaseItem = { productId: '', description: '', qty: 1, unitCost: 0, discount: 0 };
const emptySalesForm = { invoiceId: '', customerId: '', refundAmount: 0, refundMethod: 'CASH', reason: '', notes: '', items: [{ ...emptySalesItem }] };
const emptyPurchaseForm = { grnId: '', supplierId: '', refundReceived: 0, refundMethod: 'CASH', reason: '', notes: '', items: [{ ...emptyPurchaseItem }] };

function money(value) { return `LKR ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }

export default function Returns() {
  const [activeTab, setActiveTab] = useState('sales');
  const [drawer, setDrawer] = useState(null);
  const [selected, setSelected] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [grns, setGrns] = useState([]);
  const [salesReturns, setSalesReturns] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [error, setError] = useState('');
  const [salesForm, setSalesForm] = useState(emptySalesForm);
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchaseForm);

  async function load() {
    const [customerRes, supplierRes, productRes, invoiceRes, grnRes, salesReturnRes, purchaseReturnRes] = await Promise.all([
      api.get('/customers'), api.get('/suppliers'), api.get('/products'), api.get('/invoices'), api.get('/purchases/grns'), api.get('/returns/sales'), api.get('/returns/purchases')
    ]);
    setCustomers(customerRes.data || []);
    setSuppliers(supplierRes.data || []);
    setProducts(productRes.data || []);
    setInvoices(invoiceRes.data || []);
    setGrns(grnRes.data || []);
    setSalesReturns(salesReturnRes.data || []);
    setPurchaseReturns(purchaseReturnRes.data || []);
  }

  useEffect(() => { load().catch(e => setError(e.response?.data?.message || 'Failed to load returns')); }, []);

  const salesTotal = useMemo(() => salesForm.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0), 0), [salesForm.items]);
  const purchaseTotal = useMemo(() => purchaseForm.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitCost || 0) - Number(item.discount || 0), 0), [purchaseForm.items]);

  function setSalesItem(index, key, value) {
    const items = [...salesForm.items];
    items[index] = { ...items[index], [key]: value };
    if (key === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        items[index].description = product.name;
        items[index].unitPrice = Number(product.salePrice || 0);
      }
    }
    setSalesForm({ ...salesForm, items });
  }

  function setPurchaseItem(index, key, value) {
    const items = [...purchaseForm.items];
    items[index] = { ...items[index], [key]: value };
    if (key === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        items[index].description = product.name;
        items[index].unitCost = Number(product.costPrice || 0);
      }
    }
    setPurchaseForm({ ...purchaseForm, items });
  }

  function fillSalesFromInvoice(invoiceId) {
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return setSalesForm({ ...salesForm, invoiceId: '', customerId: '', items: [{ ...emptySalesItem }] });
    setSalesForm({ ...salesForm, invoiceId: invoice.id, customerId: invoice.customerId || '', items: (invoice.items || []).map(item => ({ productId: item.productId || '', description: item.description, qty: Number(item.qty || 1), unitPrice: Number(item.unitPrice || 0), discount: Number(item.discount || 0) })) });
  }

  function fillPurchaseFromGrn(grnId) {
    const grn = grns.find(g => g.id === grnId);
    if (!grn) return setPurchaseForm({ ...purchaseForm, grnId: '', supplierId: '', items: [{ ...emptyPurchaseItem }] });
    setPurchaseForm({ ...purchaseForm, grnId: grn.id, supplierId: grn.supplierId || '', items: (grn.items || []).map(item => ({ productId: item.productId || '', description: item.description, qty: Number(item.qty || 1), unitCost: Number(item.unitCost || 0), discount: Number(item.discount || 0) })) });
  }

  function addSalesItem() { setSalesForm({ ...salesForm, items: [...salesForm.items, { ...emptySalesItem }] }); }
  function addPurchaseItem() { setPurchaseForm({ ...purchaseForm, items: [...purchaseForm.items, { ...emptyPurchaseItem }] }); }
  function removeSalesItem(index) { setSalesForm({ ...salesForm, items: salesForm.items.length === 1 ? salesForm.items : salesForm.items.filter((_, i) => i !== index) }); }
  function removePurchaseItem(index) { setPurchaseForm({ ...purchaseForm, items: purchaseForm.items.length === 1 ? purchaseForm.items : purchaseForm.items.filter((_, i) => i !== index) }); }

  async function createSalesReturn(e) {
    e.preventDefault(); setError('');
    try {
      await api.post('/returns/sales', { invoiceId: salesForm.invoiceId || null, customerId: salesForm.customerId || null, refundAmount: Number(salesForm.refundAmount || 0), refundMethod: salesForm.refundMethod, reason: salesForm.reason || null, notes: salesForm.notes || null, items: salesForm.items.map(item => ({ ...item, productId: item.productId || null, qty: Number(item.qty), unitPrice: Number(item.unitPrice), discount: Number(item.discount || 0) })) });
      setSalesForm(emptySalesForm); setDrawer(null); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create sales return'); }
  }

  async function createPurchaseReturn(e) {
    e.preventDefault(); setError('');
    try {
      await api.post('/returns/purchases', { grnId: purchaseForm.grnId || null, supplierId: purchaseForm.supplierId || null, refundReceived: Number(purchaseForm.refundReceived || 0), refundMethod: purchaseForm.refundMethod, reason: purchaseForm.reason || null, notes: purchaseForm.notes || null, items: purchaseForm.items.map(item => ({ ...item, productId: item.productId || null, qty: Number(item.qty), unitCost: Number(item.unitCost), discount: Number(item.discount || 0) })) });
      setPurchaseForm(emptyPurchaseForm); setDrawer(null); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create purchase return'); }
  }

  function SalesItems() {
    return <div className="doc-line-list">{salesForm.items.map((item, index) => <div className="doc-line-row" key={index}><select value={item.productId} onChange={(e) => setSalesItem(index, 'productId', e.target.value)}><option value="">Manual item</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} — stock {product.stockQty}</option>)}</select><input placeholder="Description" value={item.description} onChange={(e) => setSalesItem(index, 'description', e.target.value)} /><input type="number" min="0.001" step="0.001" value={item.qty} onChange={(e) => setSalesItem(index, 'qty', e.target.value)} /><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setSalesItem(index, 'unitPrice', e.target.value)} /><input type="number" min="0" step="0.01" value={item.discount} onChange={(e) => setSalesItem(index, 'discount', e.target.value)} placeholder="Disc" /><button type="button" className="mini-danger" onClick={() => removeSalesItem(index)}>×</button></div>)}<button type="button" className="mini-action" onClick={addSalesItem}>+ Add item</button></div>;
  }

  function PurchaseItems() {
    return <div className="doc-line-list">{purchaseForm.items.map((item, index) => <div className="doc-line-row" key={index}><select value={item.productId} onChange={(e) => setPurchaseItem(index, 'productId', e.target.value)}><option value="">Manual item</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} — stock {product.stockQty}</option>)}</select><input placeholder="Description" value={item.description} onChange={(e) => setPurchaseItem(index, 'description', e.target.value)} /><input type="number" min="0.001" step="0.001" value={item.qty} onChange={(e) => setPurchaseItem(index, 'qty', e.target.value)} /><input type="number" min="0" step="0.01" value={item.unitCost} onChange={(e) => setPurchaseItem(index, 'unitCost', e.target.value)} /><input type="number" min="0" step="0.01" value={item.discount} onChange={(e) => setPurchaseItem(index, 'discount', e.target.value)} placeholder="Disc" /><button type="button" className="mini-danger" onClick={() => removePurchaseItem(index)}>×</button></div>)}<button type="button" className="mini-action" onClick={addPurchaseItem}>+ Add item</button></div>;
  }

  const rows = activeTab === 'sales' ? salesReturns : purchaseReturns;
  const selectedRow = selected?.row;

  return (
    <div className="page returns-page sales-doc-page">
      <div className="page-head"><div><h1>Returns</h1><p>Manage customer returns and supplier damaged-stock returns with clean full-width registers.</p></div><div className="head-actions"><button className={activeTab === 'sales' ? 'primary-btn' : 'secondary-btn'} onClick={() => setActiveTab('sales')}>Sales Returns</button><button className={activeTab === 'purchase' ? 'primary-btn' : 'secondary-btn'} onClick={() => setActiveTab('purchase')}>Purchase Returns</button><button className="primary-btn" onClick={() => setDrawer(activeTab)}>+ New Return</button></div></div>
      {error && <div className="error-box">{error}</div>}

      <section className="panel sales-doc-panel"><div className="section-title-row"><div><h2>{activeTab === 'sales' ? 'Sales Return Register' : 'Purchase Return Register'}</h2><p className="sales-doc-hint">Click a row to view return details. Creation form stays inside drawer.</p></div><span className="badge unpaid">{rows.length} records</span></div><DataTable columns={activeTab === 'sales' ? [{ key: 'returnNo', label: 'Return No' }, { key: 'customer', label: 'Customer', render: r => r.customer?.name || '-' }, { key: 'invoice', label: 'Invoice', render: r => r.invoice?.invoiceNo || '-' }, { key: 'refundAmount', label: 'Refund', render: r => money(r.refundAmount) }, { key: 'status', label: 'Status', render: r => <span className="badge paid">{r.status}</span> }] : [{ key: 'returnNo', label: 'Return No' }, { key: 'supplier', label: 'Supplier', render: r => r.supplier?.name || '-' }, { key: 'grn', label: 'GRN', render: r => r.grn?.grnNo || '-' }, { key: 'refundReceived', label: 'Refund', render: r => money(r.refundReceived) }, { key: 'status', label: 'Status', render: r => <span className="badge paid">{r.status}</span> }]} rows={rows} onRowClick={(row) => setSelected({ type: activeTab, row })} /></section>

      <ModalDrawer open={drawer === 'sales'} onClose={() => setDrawer(null)} title="Create Sales Return" description={`Return total preview: ${money(salesTotal)}`} mode="drawer" size="xl"><form className="doc-form" onSubmit={createSalesReturn}><div className="form-grid two"><label>Invoice<select value={salesForm.invoiceId} onChange={(e) => fillSalesFromInvoice(e.target.value)}><option value="">Return without invoice</option>{invoices.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} — {invoice.customer?.name || 'Walk-in'}</option>)}</select></label><label>Customer<select value={salesForm.customerId} onChange={(e) => setSalesForm({ ...salesForm, customerId: e.target.value })}><option value="">Walk-in customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label>Refund Amount<input type="number" min="0" step="0.01" value={salesForm.refundAmount} onChange={(e) => setSalesForm({ ...salesForm, refundAmount: e.target.value })} /></label><label>Refund Method<select value={salesForm.refundMethod} onChange={(e) => setSalesForm({ ...salesForm, refundMethod: e.target.value })}><option>CASH</option><option>CARD</option><option>BANK_TRANSFER</option><option>CHEQUE</option><option>ONLINE</option></select></label><label>Reason<input value={salesForm.reason} onChange={(e) => setSalesForm({ ...salesForm, reason: e.target.value })} placeholder="Damaged, wrong item, warranty..." /></label><label>Notes<input value={salesForm.notes} onChange={(e) => setSalesForm({ ...salesForm, notes: e.target.value })} placeholder="Extra return notes" /></label></div><SalesItems /><div className="doc-actions-footer"><button className="primary-btn">Post Sales Return</button></div></form></ModalDrawer>
      <ModalDrawer open={drawer === 'purchase'} onClose={() => setDrawer(null)} title="Create Purchase Return" description={`Return total preview: ${money(purchaseTotal)}`} mode="drawer" size="xl"><form className="doc-form" onSubmit={createPurchaseReturn}><div className="form-grid two"><label>GRN<select value={purchaseForm.grnId} onChange={(e) => fillPurchaseFromGrn(e.target.value)}><option value="">Return without GRN</option>{grns.map(grn => <option key={grn.id} value={grn.id}>{grn.grnNo} — {grn.supplier?.name || 'No supplier'}</option>)}</select></label><label>Supplier<select value={purchaseForm.supplierId} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })}><option value="">No supplier</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Refund Received<input type="number" min="0" step="0.01" value={purchaseForm.refundReceived} onChange={(e) => setPurchaseForm({ ...purchaseForm, refundReceived: e.target.value })} /></label><label>Refund Method<select value={purchaseForm.refundMethod} onChange={(e) => setPurchaseForm({ ...purchaseForm, refundMethod: e.target.value })}><option>CASH</option><option>CARD</option><option>BANK_TRANSFER</option><option>CHEQUE</option><option>ONLINE</option></select></label><label>Reason<input value={purchaseForm.reason} onChange={(e) => setPurchaseForm({ ...purchaseForm, reason: e.target.value })} placeholder="Damaged, expired, wrong supply..." /></label><label>Notes<input value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} placeholder="Extra return notes" /></label></div><PurchaseItems /><div className="doc-actions-footer"><button className="primary-btn">Post Purchase Return</button></div></form></ModalDrawer>

      <ModalDrawer open={Boolean(selectedRow)} onClose={() => setSelected(null)} title={selectedRow?.returnNo || 'Return'} description="Return document details." mode="modal" size="lg">{selectedRow && <div className="doc-detail-grid"><div className="detail-card"><span>Party</span><strong>{selectedRow.customer?.name || selectedRow.supplier?.name || '-'}</strong></div><div className="detail-card"><span>Status</span><strong>{selectedRow.status || '-'}</strong></div><div className="detail-card"><span>Amount</span><strong>{money(selectedRow.refundAmount || selectedRow.refundReceived)}</strong></div><div className="detail-card"><span>Date</span><strong>{dateOnly(selectedRow.createdAt)}</strong></div></div>}</ModalDrawer>
    </div>
  );
}
