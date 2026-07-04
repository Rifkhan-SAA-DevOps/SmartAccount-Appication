import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

const emptySalesItem = { productId: '', description: '', qty: 1, unitPrice: 0, discount: 0 };
const emptyPurchaseItem = { productId: '', description: '', qty: 1, unitCost: 0, discount: 0 };

export default function Returns() {
  const [activeTab, setActiveTab] = useState('sales');
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [grns, setGrns] = useState([]);
  const [salesReturns, setSalesReturns] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [error, setError] = useState('');

  const [salesForm, setSalesForm] = useState({
    invoiceId: '', customerId: '', refundAmount: 0, refundMethod: 'CASH', reason: '', notes: '', items: [{ ...emptySalesItem }]
  });
  const [purchaseForm, setPurchaseForm] = useState({
    grnId: '', supplierId: '', refundReceived: 0, refundMethod: 'CASH', reason: '', notes: '', items: [{ ...emptyPurchaseItem }]
  });

  async function load() {
    const [customerRes, supplierRes, productRes, invoiceRes, grnRes, salesReturnRes, purchaseReturnRes] = await Promise.all([
      api.get('/customers'),
      api.get('/suppliers'),
      api.get('/products'),
      api.get('/invoices'),
      api.get('/purchases/grns'),
      api.get('/returns/sales'),
      api.get('/returns/purchases')
    ]);
    setCustomers(customerRes.data);
    setSuppliers(supplierRes.data);
    setProducts(productRes.data);
    setInvoices(invoiceRes.data);
    setGrns(grnRes.data);
    setSalesReturns(salesReturnRes.data);
    setPurchaseReturns(purchaseReturnRes.data);
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
    if (!invoice) {
      setSalesForm({ ...salesForm, invoiceId: '', customerId: '', items: [{ ...emptySalesItem }] });
      return;
    }
    setSalesForm({
      ...salesForm,
      invoiceId: invoice.id,
      customerId: invoice.customerId || '',
      items: invoice.items.map(item => ({
        productId: item.productId || '',
        description: item.description,
        qty: Number(item.qty || 1),
        unitPrice: Number(item.unitPrice || 0),
        discount: Number(item.discount || 0)
      }))
    });
  }

  function fillPurchaseFromGrn(grnId) {
    const grn = grns.find(g => g.id === grnId);
    if (!grn) {
      setPurchaseForm({ ...purchaseForm, grnId: '', supplierId: '', items: [{ ...emptyPurchaseItem }] });
      return;
    }
    setPurchaseForm({
      ...purchaseForm,
      grnId: grn.id,
      supplierId: grn.supplierId || '',
      items: grn.items.map(item => ({
        productId: item.productId || '',
        description: item.description,
        qty: Number(item.qty || 1),
        unitCost: Number(item.unitCost || 0),
        discount: Number(item.discount || 0)
      }))
    });
  }

  function addSalesItem() { setSalesForm({ ...salesForm, items: [...salesForm.items, { ...emptySalesItem }] }); }
  function addPurchaseItem() { setPurchaseForm({ ...purchaseForm, items: [...purchaseForm.items, { ...emptyPurchaseItem }] }); }

  function removeSalesItem(index) {
    if (salesForm.items.length === 1) return;
    setSalesForm({ ...salesForm, items: salesForm.items.filter((_, i) => i !== index) });
  }

  function removePurchaseItem(index) {
    if (purchaseForm.items.length === 1) return;
    setPurchaseForm({ ...purchaseForm, items: purchaseForm.items.filter((_, i) => i !== index) });
  }

  async function createSalesReturn(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/returns/sales', {
        invoiceId: salesForm.invoiceId || null,
        customerId: salesForm.customerId || null,
        refundAmount: Number(salesForm.refundAmount || 0),
        refundMethod: salesForm.refundMethod,
        reason: salesForm.reason || null,
        notes: salesForm.notes || null,
        items: salesForm.items.map(item => ({ ...item, productId: item.productId || null, qty: Number(item.qty), unitPrice: Number(item.unitPrice), discount: Number(item.discount || 0) }))
      });
      setSalesForm({ invoiceId: '', customerId: '', refundAmount: 0, refundMethod: 'CASH', reason: '', notes: '', items: [{ ...emptySalesItem }] });
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create sales return'); }
  }

  async function createPurchaseReturn(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/returns/purchases', {
        grnId: purchaseForm.grnId || null,
        supplierId: purchaseForm.supplierId || null,
        refundReceived: Number(purchaseForm.refundReceived || 0),
        refundMethod: purchaseForm.refundMethod,
        reason: purchaseForm.reason || null,
        notes: purchaseForm.notes || null,
        items: purchaseForm.items.map(item => ({ ...item, productId: item.productId || null, qty: Number(item.qty), unitCost: Number(item.unitCost), discount: Number(item.discount || 0) }))
      });
      setPurchaseForm({ grnId: '', supplierId: '', refundReceived: 0, refundMethod: 'CASH', reason: '', notes: '', items: [{ ...emptyPurchaseItem }] });
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create purchase return'); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Returns</h1>
          <p>Manage customer product returns and supplier damaged-stock returns with automatic stock and balance updates.</p>
        </div>
        <div className="head-actions">
          <button className={activeTab === 'sales' ? 'primary-btn' : 'secondary-btn'} onClick={() => setActiveTab('sales')}>Sales Return</button>
          <button className={activeTab === 'purchase' ? 'primary-btn' : 'secondary-btn'} onClick={() => setActiveTab('purchase')}>Purchase Return</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {activeTab === 'sales' ? (
        <section className="panel invoice-builder">
          <h2>New Sales Return</h2>
          <form onSubmit={createSalesReturn}>
            <div className="form-grid three">
              <label>Invoice
                <select value={salesForm.invoiceId} onChange={(e) => fillSalesFromInvoice(e.target.value)}>
                  <option value="">Return without invoice</option>
                  {invoices.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} — {invoice.customer?.name || 'Walk-in'}</option>)}
                </select>
              </label>
              <label>Customer
                <select value={salesForm.customerId} onChange={(e) => setSalesForm({ ...salesForm, customerId: e.target.value })}>
                  <option value="">Walk-in customer</option>
                  {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </label>
              <label>Refund Amount
                <input type="number" min="0" step="0.01" value={salesForm.refundAmount} onChange={(e) => setSalesForm({ ...salesForm, refundAmount: e.target.value })} />
              </label>
              <label>Refund Method
                <select value={salesForm.refundMethod} onChange={(e) => setSalesForm({ ...salesForm, refundMethod: e.target.value })}>
                  <option>CASH</option><option>CARD</option><option>BANK_TRANSFER</option><option>CHEQUE</option><option>ONLINE</option>
                </select>
              </label>
              <label>Reason
                <input value={salesForm.reason} onChange={(e) => setSalesForm({ ...salesForm, reason: e.target.value })} placeholder="Damaged, wrong item, warranty..." />
              </label>
              <label>Notes
                <input value={salesForm.notes} onChange={(e) => setSalesForm({ ...salesForm, notes: e.target.value })} placeholder="Extra return notes" />
              </label>
            </div>
            <div className="items-list">
              {salesForm.items.map((item, index) => (
                <div className="item-row purchase-item-row" key={index}>
                  <select value={item.productId} onChange={(e) => setSalesItem(index, 'productId', e.target.value)}>
                    <option value="">Manual item</option>
                    {products.map(product => <option key={product.id} value={product.id}>{product.name} — stock {product.stockQty}</option>)}
                  </select>
                  <input placeholder="Description" value={item.description} onChange={(e) => setSalesItem(index, 'description', e.target.value)} />
                  <input type="number" min="0.001" step="0.001" value={item.qty} onChange={(e) => setSalesItem(index, 'qty', e.target.value)} />
                  <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setSalesItem(index, 'unitPrice', e.target.value)} />
                  <button type="button" className="mini-danger" onClick={() => removeSalesItem(index)}>Remove</button>
                </div>
              ))}
            </div>
            <div className="invoice-actions">
              <button type="button" className="secondary-btn" onClick={addSalesItem}>+ Add Item</button>
              <div className="invoice-total">Return Total: <strong>LKR {salesTotal.toFixed(2)}</strong></div>
              <button className="primary-btn">Post Sales Return</button>
            </div>
          </form>
        </section>
      ) : (
        <section className="panel invoice-builder">
          <h2>New Purchase Return</h2>
          <form onSubmit={createPurchaseReturn}>
            <div className="form-grid three">
              <label>GRN
                <select value={purchaseForm.grnId} onChange={(e) => fillPurchaseFromGrn(e.target.value)}>
                  <option value="">Return without GRN</option>
                  {grns.map(grn => <option key={grn.id} value={grn.id}>{grn.grnNo} — {grn.supplier?.name || 'No supplier'}</option>)}
                </select>
              </label>
              <label>Supplier
                <select value={purchaseForm.supplierId} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })}>
                  <option value="">No supplier</option>
                  {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
              <label>Refund Received
                <input type="number" min="0" step="0.01" value={purchaseForm.refundReceived} onChange={(e) => setPurchaseForm({ ...purchaseForm, refundReceived: e.target.value })} />
              </label>
              <label>Refund Method
                <select value={purchaseForm.refundMethod} onChange={(e) => setPurchaseForm({ ...purchaseForm, refundMethod: e.target.value })}>
                  <option>CASH</option><option>CARD</option><option>BANK_TRANSFER</option><option>CHEQUE</option><option>ONLINE</option>
                </select>
              </label>
              <label>Reason
                <input value={purchaseForm.reason} onChange={(e) => setPurchaseForm({ ...purchaseForm, reason: e.target.value })} placeholder="Damaged, expired, wrong supply..." />
              </label>
              <label>Notes
                <input value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} placeholder="Extra return notes" />
              </label>
            </div>
            <div className="items-list">
              {purchaseForm.items.map((item, index) => (
                <div className="item-row purchase-item-row" key={index}>
                  <select value={item.productId} onChange={(e) => setPurchaseItem(index, 'productId', e.target.value)}>
                    <option value="">Manual item</option>
                    {products.map(product => <option key={product.id} value={product.id}>{product.name} — stock {product.stockQty}</option>)}
                  </select>
                  <input placeholder="Description" value={item.description} onChange={(e) => setPurchaseItem(index, 'description', e.target.value)} />
                  <input type="number" min="0.001" step="0.001" value={item.qty} onChange={(e) => setPurchaseItem(index, 'qty', e.target.value)} />
                  <input type="number" min="0" step="0.01" value={item.unitCost} onChange={(e) => setPurchaseItem(index, 'unitCost', e.target.value)} />
                  <button type="button" className="mini-danger" onClick={() => removePurchaseItem(index)}>Remove</button>
                </div>
              ))}
            </div>
            <div className="invoice-actions">
              <button type="button" className="secondary-btn" onClick={addPurchaseItem}>+ Add Item</button>
              <div className="invoice-total">Return Total: <strong>LKR {purchaseTotal.toFixed(2)}</strong></div>
              <button className="primary-btn">Post Purchase Return</button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <h2>Recent Sales Returns</h2>
        <DataTable columns={[
          { key: 'returnNo', label: 'Return No' },
          { key: 'invoice', label: 'Invoice', render: r => r.invoice?.invoiceNo || '-' },
          { key: 'customer', label: 'Customer', render: r => r.customer?.name || 'Walk-in' },
          { key: 'total', label: 'Total', render: r => `LKR ${r.total}` },
          { key: 'refundAmount', label: 'Refund', render: r => `LKR ${r.refundAmount}` },
          { key: 'status', label: 'Status', render: r => <span className="badge paid">{r.status}</span> }
        ]} rows={salesReturns} />
      </section>

      <section className="panel">
        <h2>Recent Purchase Returns</h2>
        <DataTable columns={[
          { key: 'returnNo', label: 'Return No' },
          { key: 'grn', label: 'GRN', render: r => r.grn?.grnNo || '-' },
          { key: 'supplier', label: 'Supplier', render: r => r.supplier?.name || '-' },
          { key: 'total', label: 'Total', render: r => `LKR ${r.total}` },
          { key: 'refundReceived', label: 'Refund Received', render: r => `LKR ${r.refundReceived}` },
          { key: 'status', label: 'Status', render: r => <span className="badge paid">{r.status}</span> }
        ]} rows={purchaseReturns} />
      </section>
    </div>
  );
}
