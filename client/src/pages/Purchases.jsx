import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, PackageCheck, PackagePlus, Plus, RefreshCw, ShoppingBag, Truck, X } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import '../styles/daily-work-ui.css';

const emptyItem = { productId: '', description: '', qty: 1, unitCost: 0, discount: 0 };

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function badgeTone(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('received') || s.includes('posted')) return 'paid';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('partial')) return 'partial';
  return 'unpaid';
}

export default function Purchases() {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [grns, setGrns] = useState([]);
  const [activeTab, setActiveTab] = useState('grn');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [poForm, setPoForm] = useState({ supplierId: '', expectedDate: '', notes: '', items: [{ ...emptyItem }] });
  const [grnForm, setGrnForm] = useState({ supplierId: '', purchaseOrderId: '', paid: 0, paymentMethod: 'CASH', notes: '', items: [{ ...emptyItem }] });

  async function load() {
    const [supplierRes, productRes, orderRes, grnRes] = await Promise.all([
      api.get('/suppliers'),
      api.get('/products'),
      api.get('/purchases/orders'),
      api.get('/purchases/grns')
    ]);
    setSuppliers(supplierRes.data || []);
    setProducts(productRes.data || []);
    setOrders(orderRes.data || []);
    setGrns(grnRes.data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load purchases')); }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  function setItem(formName, index, key, value) {
    const current = formName === 'po' ? poForm : grnForm;
    const items = current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item);
    if (key === 'productId') {
      const product = products.find((p) => p.id === value);
      if (product) {
        items[index].description = product.name;
        items[index].unitCost = Number(product.costPrice || 0);
      }
    }
    formName === 'po' ? setPoForm({ ...poForm, items }) : setGrnForm({ ...grnForm, items });
  }

  function addItem(formName) {
    if (formName === 'po') setPoForm({ ...poForm, items: [...poForm.items, { ...emptyItem }] });
    else setGrnForm({ ...grnForm, items: [...grnForm.items, { ...emptyItem }] });
  }

  function removeItem(formName, index) {
    const current = formName === 'po' ? poForm : grnForm;
    if (current.items.length <= 1) return;
    const items = current.items.filter((_, itemIndex) => itemIndex !== index);
    formName === 'po' ? setPoForm({ ...poForm, items }) : setGrnForm({ ...grnForm, items });
  }

  function cleanItems(items) {
    return items.map((item) => ({
      productId: item.productId || null,
      description: item.description,
      qty: Number(item.qty || 0),
      unitCost: Number(item.unitCost || 0),
      discount: Number(item.discount || 0)
    }));
  }

  const poTotal = useMemo(() => poForm.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitCost || 0) - Number(item.discount || 0), 0), [poForm.items]);
  const grnTotal = useMemo(() => grnForm.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitCost || 0) - Number(item.discount || 0), 0), [grnForm.items]);
  const purchaseValue = grns.reduce((sum, grn) => sum + Number(grn.total || 0), 0);
  const supplierCredit = grns.reduce((sum, grn) => sum + Number(grn.balance || 0), 0);
  const openOrders = orders.filter((order) => !['RECEIVED', 'CANCELLED'].includes(order.status)).length;
  const receivedOrders = orders.filter((order) => order.status === 'RECEIVED').length;

  const filteredGrns = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grns;
    return grns.filter((grn) => [grn.grnNo, grn.supplier?.name, grn.status, grn.total, grn.balance].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [grns, query]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) => [order.purchaseNo, order.supplier?.name, order.status, order.total].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [orders, query]);

  async function createPurchaseOrder(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/purchases/orders', {
        supplierId: poForm.supplierId || null,
        expectedDate: poForm.expectedDate || null,
        notes: poForm.notes || null,
        items: cleanItems(poForm.items)
      });
      setPoForm({ supplierId: '', expectedDate: '', notes: '', items: [{ ...emptyItem }] });
      flash('Purchase order created. You can receive it later as GRN.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  }

  async function createGrn(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/purchases/grns', {
        supplierId: grnForm.supplierId || null,
        purchaseOrderId: grnForm.purchaseOrderId || null,
        paid: Number(grnForm.paid || 0),
        paymentMethod: grnForm.paymentMethod,
        notes: grnForm.notes || null,
        items: cleanItems(grnForm.items)
      });
      setGrnForm({ supplierId: '', purchaseOrderId: '', paid: 0, paymentMethod: 'CASH', notes: '', items: [{ ...emptyItem }] });
      flash('GRN posted. Stock and supplier balance updated.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create GRN');
    } finally {
      setSaving(false);
    }
  }

  function fillGrnFromPo(poId) {
    const po = orders.find((order) => order.id === poId);
    if (!po) {
      setGrnForm({ ...grnForm, purchaseOrderId: '', items: [{ ...emptyItem }] });
      return;
    }
    setGrnForm({
      ...grnForm,
      purchaseOrderId: po.id,
      supplierId: po.supplierId || '',
      items: (po.items || []).map((item) => ({
        productId: item.productId || '',
        description: item.description,
        qty: Number(item.qty || 1),
        unitCost: Number(item.unitCost || 0),
        discount: Number(item.discount || 0)
      }))
    });
  }

  function ItemRows({ formName, items }) {
    return (
      <div className="workflow-item-list">
        {items.map((item, index) => (
          <div className="workflow-item-row purchase" key={index}>
            <select value={item.productId} onChange={(e) => setItem(formName, index, 'productId', e.target.value)}>
              <option value="">Manual item</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name} — stock {product.stockQty}</option>)}
            </select>
            <input placeholder="Description" value={item.description} onChange={(e) => setItem(formName, index, 'description', e.target.value)} required />
            <input type="number" min="0.001" step="0.001" value={item.qty} onChange={(e) => setItem(formName, index, 'qty', e.target.value)} />
            <input type="number" min="0" step="0.01" value={item.unitCost} onChange={(e) => setItem(formName, index, 'unitCost', e.target.value)} />
            <strong className="workflow-item-amount">{money(Number(item.qty || 0) * Number(item.unitCost || 0))}</strong>
            <button type="button" className="mini-danger icon-only" onClick={() => removeItem(formName, index)} disabled={items.length === 1}><X size={16} /></button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="page workflow-page purchases-workflow-page">
      <section className="workflow-hero">
        <div className="workflow-hero-body">
          <div>
            <span className="workflow-kicker"><Truck size={16} /> Supplier Stock Flow</span>
            <h1>Purchases & GRN</h1>
            <p>Use purchase orders to request stock from suppliers. Use GRN when goods arrive to increase inventory and track supplier credit.</p>
          </div>
          <div className="workflow-hero-actions">
            <button className="secondary-btn" type="button" onClick={load}><RefreshCw size={16} /> Refresh</button>
            <button className={activeTab === 'grn' ? 'primary-btn' : 'secondary-btn'} onClick={() => setActiveTab('grn')}>New GRN</button>
            <button className={activeTab === 'po' ? 'primary-btn' : 'secondary-btn'} onClick={() => setActiveTab('po')}>New PO</button>
          </div>
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <section className="workflow-stat-grid">
        <div className="workflow-stat-card blue"><div className="workflow-stat-icon"><ClipboardList size={20} /></div><span>Open purchase orders</span><strong>{openOrders}</strong><small>Waiting to receive</small></div>
        <div className="workflow-stat-card green"><div className="workflow-stat-icon"><PackageCheck size={20} /></div><span>Received orders</span><strong>{receivedOrders}</strong><small>Completed purchase orders</small></div>
        <div className="workflow-stat-card orange"><div className="workflow-stat-icon"><ShoppingBag size={20} /></div><span>Total GRN value</span><strong>{money(purchaseValue)}</strong><small>Goods received value</small></div>
        <div className="workflow-stat-card red"><div className="workflow-stat-icon"><PackagePlus size={20} /></div><span>Supplier credit</span><strong>{money(supplierCredit)}</strong><small>Balance to pay suppliers</small></div>
      </section>

      <div className="workflow-main-grid">
        <section className="workflow-panel">
          <div className="workflow-panel-head">
            <div>
              <h2>{activeTab === 'grn' ? <><PackageCheck size={20} /> Goods Received Note</> : <><ClipboardList size={20} /> Purchase Order</>}</h2>
              <p>{activeTab === 'grn' ? 'Post GRN only when products physically arrive. This updates stock immediately.' : 'Create PO when you want to order stock but have not received goods yet.'}</p>
            </div>
            <span className="workflow-pill dark">Total {money(activeTab === 'grn' ? grnTotal : poTotal)}</span>
          </div>

          {activeTab === 'grn' ? (
            <form onSubmit={createGrn} className="workflow-form-stack">
              <div className="workflow-form-grid three">
                <label>Purchase Order
                  <select value={grnForm.purchaseOrderId} onChange={(e) => fillGrnFromPo(e.target.value)}>
                    <option value="">Receive without PO</option>
                    {orders.filter((order) => !['RECEIVED', 'CANCELLED'].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.purchaseNo} — {order.supplier?.name || 'No supplier'}</option>)}
                  </select>
                </label>
                <label>Supplier
                  <select value={grnForm.supplierId} onChange={(e) => setGrnForm({ ...grnForm, supplierId: e.target.value })}>
                    <option value="">No supplier</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </label>
                <label>Paid Amount
                  <input type="number" min="0" step="0.01" value={grnForm.paid} onChange={(e) => setGrnForm({ ...grnForm, paid: e.target.value })} />
                </label>
                <label>Payment Method
                  <select value={grnForm.paymentMethod} onChange={(e) => setGrnForm({ ...grnForm, paymentMethod: e.target.value })}>
                    <option>CASH</option><option>CARD</option><option>BANK_TRANSFER</option><option>CHEQUE</option><option>ONLINE</option>
                  </select>
                </label>
                <label className="workflow-span-two">Notes
                  <input value={grnForm.notes} onChange={(e) => setGrnForm({ ...grnForm, notes: e.target.value })} placeholder="Supplier invoice number, transport details, remarks..." />
                </label>
              </div>
              <ItemRows formName="grn" items={grnForm.items} />
              <div className="workflow-action-row">
                <button type="button" className="secondary-btn" onClick={() => addItem('grn')}><Plus size={16} /> Add Item</button>
                <button className="primary-btn" disabled={saving}>{saving ? 'Posting...' : 'Post GRN & Update Stock'}</button>
              </div>
            </form>
          ) : (
            <form onSubmit={createPurchaseOrder} className="workflow-form-stack">
              <div className="workflow-form-grid three">
                <label>Supplier
                  <select value={poForm.supplierId} onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}>
                    <option value="">No supplier</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </label>
                <label>Expected Date
                  <input type="date" value={poForm.expectedDate} onChange={(e) => setPoForm({ ...poForm, expectedDate: e.target.value })} />
                </label>
                <label>Notes
                  <input value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} placeholder="Purchase remarks" />
                </label>
              </div>
              <ItemRows formName="po" items={poForm.items} />
              <div className="workflow-action-row">
                <button type="button" className="secondary-btn" onClick={() => addItem('po')}><Plus size={16} /> Add Item</button>
                <button className="primary-btn" disabled={saving}>{saving ? 'Creating...' : 'Create Purchase Order'}</button>
              </div>
            </form>
          )}
        </section>

        <aside className="workflow-summary-stack">
          <div className="workflow-help-card">
            <h2>Simple purchase flow</h2>
            <div className="workflow-help-list">
              <div><b>1</b><span>PO means you ordered products from supplier. Stock does not increase yet.</span></div>
              <div><b>2</b><span>GRN means goods arrived. Stock increases and supplier payable is created.</span></div>
              <div><b>3</b><span>Paid amount reduces supplier credit. Balance stays as supplier payable.</span></div>
            </div>
          </div>
          <div className="workflow-mini-card"><span>Suppliers</span><strong>{suppliers.length}</strong></div>
          <div className="workflow-mini-card"><span>Products available</span><strong>{products.length}</strong></div>
          <div className="workflow-mini-card"><span>Current form total</span><strong>{money(activeTab === 'grn' ? grnTotal : poTotal)}</strong></div>
        </aside>
      </div>

      <section className="workflow-panel workflow-table-panel">
        <div className="workflow-panel-head">
          <div>
            <h2><PackageCheck size={20} /> Recent GRNs</h2>
            <p>These are received goods. GRN increases product stock and creates supplier balance if not fully paid.</p>
          </div>
          <div className="workflow-search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search supplier, GRN, PO or status" />
            <select value="" onChange={(e) => setQuery(e.target.value)}><option value="">Quick filter</option><option value="POSTED">Posted</option><option value="RECEIVED">Received</option><option value="PARTIAL">Partial</option></select>
            <button className="secondary-btn" onClick={() => setQuery('')}>Reset</button>
          </div>
        </div>
        <DataTable
          columns={[
            { key: 'grnNo', label: 'GRN No', render: (row) => <strong>{row.grnNo}</strong> },
            { key: 'supplier', label: 'Supplier', render: (row) => row.supplier?.name || '-' },
            { key: 'total', label: 'Total', render: (row) => <strong>{money(row.total)}</strong> },
            { key: 'paid', label: 'Paid', render: (row) => money(row.paid) },
            { key: 'balance', label: 'Supplier Credit', render: (row) => money(row.balance) },
            { key: 'status', label: 'Status', render: (row) => <span className={`badge ${badgeTone(row.status || 'POSTED')}`}>{row.status || 'POSTED'}</span> }
          ]}
          rows={filteredGrns}
          empty="No GRNs found. Receive stock using the GRN form above."
        />
      </section>

      <section className="workflow-panel workflow-table-panel">
        <div className="workflow-panel-head">
          <div>
            <h2><ClipboardList size={20} /> Purchase Orders</h2>
            <p>POs are supplier orders waiting for delivery. Convert them to GRN when goods arrive.</p>
          </div>
        </div>
        <DataTable
          columns={[
            { key: 'purchaseNo', label: 'PO No', render: (row) => <strong>{row.purchaseNo}</strong> },
            { key: 'supplier', label: 'Supplier', render: (row) => row.supplier?.name || '-' },
            { key: 'total', label: 'Total', render: (row) => <strong>{money(row.total)}</strong> },
            { key: 'expectedDate', label: 'Expected Date', render: (row) => row.expectedDate ? new Date(row.expectedDate).toLocaleDateString() : '-' },
            { key: 'status', label: 'Status', render: (row) => <span className={`badge ${badgeTone(row.status)}`}>{row.status}</span> }
          ]}
          rows={filteredOrders}
          empty="No purchase orders found. Create a PO if supplier delivery is planned later."
        />
      </section>
    </div>
  );
}
