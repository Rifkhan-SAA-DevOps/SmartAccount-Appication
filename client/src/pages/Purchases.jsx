import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';

const emptyItem = { productId: '', description: '', qty: 1, unitCost: 0, discount: 0 };
const emptyPo = { supplierId: '', expectedDate: '', notes: '', items: [{ ...emptyItem }] };
const emptyGrn = { supplierId: '', purchaseOrderId: '', paid: 0, paymentMethod: 'CASH', notes: '', items: [{ ...emptyItem }] };

function money(value) { return `LKR ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }

export default function Purchases() {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [grns, setGrns] = useState([]);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [selected, setSelected] = useState(null);
  const [poForm, setPoForm] = useState(emptyPo);
  const [grnForm, setGrnForm] = useState(emptyGrn);

  async function load() {
    const [supplierRes, productRes, orderRes, grnRes] = await Promise.all([
      api.get('/suppliers'), api.get('/products'), api.get('/purchases/orders'), api.get('/purchases/grns')
    ]);
    setSuppliers(supplierRes.data || []);
    setProducts(productRes.data || []);
    setOrders(orderRes.data || []);
    setGrns(grnRes.data || []);
  }

  useEffect(() => { load().catch(e => setError(e.response?.data?.message || 'Failed to load purchases')); }, []);

  function setItem(formName, index, key, value) {
    const current = formName === 'po' ? poForm : grnForm;
    const items = [...current.items];
    items[index] = { ...items[index], [key]: value };
    if (key === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        items[index].description = product.name;
        items[index].unitCost = Number(product.costPrice || 0);
      }
    }
    formName === 'po' ? setPoForm({ ...poForm, items }) : setGrnForm({ ...grnForm, items });
  }

  function addItem(formName) {
    formName === 'po'
      ? setPoForm({ ...poForm, items: [...poForm.items, { ...emptyItem }] })
      : setGrnForm({ ...grnForm, items: [...grnForm.items, { ...emptyItem }] });
  }

  function removeItem(formName, index) {
    const current = formName === 'po' ? poForm : grnForm;
    if (current.items.length === 1) return;
    const items = current.items.filter((_, i) => i !== index);
    formName === 'po' ? setPoForm({ ...poForm, items }) : setGrnForm({ ...grnForm, items });
  }

  function cleanItems(items) {
    return items.map(item => ({ productId: item.productId || null, description: item.description, qty: Number(item.qty), unitCost: Number(item.unitCost), discount: Number(item.discount || 0) }));
  }

  const poTotal = useMemo(() => poForm.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitCost || 0) - Number(item.discount || 0), 0), [poForm.items]);
  const grnTotal = useMemo(() => grnForm.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitCost || 0) - Number(item.discount || 0), 0), [grnForm.items]);

  async function createPurchaseOrder(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/purchases/orders', { supplierId: poForm.supplierId || null, expectedDate: poForm.expectedDate || null, notes: poForm.notes || null, items: cleanItems(poForm.items) });
      setPoForm(emptyPo);
      setDrawer(null);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create purchase order'); }
  }

  async function createGrn(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/purchases/grns', { supplierId: grnForm.supplierId || null, purchaseOrderId: grnForm.purchaseOrderId || null, paid: Number(grnForm.paid || 0), paymentMethod: grnForm.paymentMethod, notes: grnForm.notes || null, items: cleanItems(grnForm.items) });
      setGrnForm(emptyGrn);
      setDrawer(null);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create GRN'); }
  }

  function fillGrnFromPo(poId) {
    const po = orders.find(o => o.id === poId);
    if (!po) return setGrnForm({ ...grnForm, purchaseOrderId: '', items: [{ ...emptyItem }] });
    setGrnForm({ ...grnForm, purchaseOrderId: po.id, supplierId: po.supplierId || '', items: (po.items || []).map(item => ({ productId: item.productId || '', description: item.description, qty: Number(item.qty || 1), unitCost: Number(item.unitCost || 0), discount: Number(item.discount || 0) })) });
  }

  function ItemRows({ formName, items }) {
    return <div className="doc-line-list">{items.map((item, index) => <div className="doc-line-row" key={index}>
      <select value={item.productId} onChange={(e) => setItem(formName, index, 'productId', e.target.value)}><option value="">Manual item</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} — stock {product.stockQty}</option>)}</select>
      <input placeholder="Description" value={item.description} onChange={(e) => setItem(formName, index, 'description', e.target.value)} />
      <input type="number" min="0.001" step="0.001" value={item.qty} onChange={(e) => setItem(formName, index, 'qty', e.target.value)} />
      <input type="number" min="0" step="0.01" value={item.unitCost} onChange={(e) => setItem(formName, index, 'unitCost', e.target.value)} />
      <input type="number" min="0" step="0.01" value={item.discount} onChange={(e) => setItem(formName, index, 'discount', e.target.value)} placeholder="Disc" />
      <button type="button" className="mini-danger" onClick={() => removeItem(formName, index)}>×</button>
    </div>)}</div>;
  }

  const selectedType = selected?.type;
  const selectedRow = selected?.row;

  return (
    <div className="page sales-doc-page">
      <div className="page-head">
        <div><h1>Purchases & GRN</h1><p>Order stock from suppliers, receive goods, update inventory and track supplier credit.</p></div>
        <div className="head-actions"><button className="primary-btn" onClick={() => setDrawer('grn')}>+ New GRN</button><button className="secondary-btn" onClick={() => setDrawer('po')}>+ New PO</button><button className="secondary-btn" onClick={load}>Refresh</button></div>
      </div>
      {error && <div className="error-box">{error}</div>}

      <div className="sales-doc-grid">
        <section className="panel sales-doc-panel"><div className="section-title-row"><div><h2>Recent GRNs</h2><p className="sales-doc-hint">Click a GRN to view supplier, payment and stock receiving details.</p></div><span className="badge paid">{grns.length} GRNs</span></div><DataTable columns={[{ key: 'grnNo', label: 'GRN No' }, { key: 'supplier', label: 'Supplier', render: r => r.supplier?.name || '-' }, { key: 'createdAt', label: 'Date', render: r => dateOnly(r.createdAt) }, { key: 'total', label: 'Total', render: r => money(r.total) }, { key: 'paid', label: 'Paid', render: r => money(r.paid) }, { key: 'balance', label: 'Supplier Credit', render: r => money(r.balance) }, { key: 'status', label: 'Status', render: r => <span className="badge paid">{r.status}</span> }]} rows={grns} onRowClick={(row) => setSelected({ type: 'GRN', row })} /></section>
        <section className="panel sales-doc-panel"><div className="section-title-row"><div><h2>Purchase Orders</h2><p className="sales-doc-hint">Click a PO to view order details. Convert to GRN from the New GRN drawer.</p></div><span className="badge unpaid">{orders.length} POs</span></div><DataTable columns={[{ key: 'purchaseNo', label: 'PO No' }, { key: 'supplier', label: 'Supplier', render: r => r.supplier?.name || '-' }, { key: 'expectedDate', label: 'Expected', render: r => dateOnly(r.expectedDate) }, { key: 'total', label: 'Total', render: r => money(r.total) }, { key: 'status', label: 'Status', render: r => <span className={`badge ${String(r.status).toLowerCase()}`}>{r.status}</span> }]} rows={orders} onRowClick={(row) => setSelected({ type: 'PO', row })} /></section>
      </div>

      <ModalDrawer open={drawer === 'grn'} onClose={() => setDrawer(null)} title="Post Goods Received Note" description="Receive products into stock and update supplier credit." mode="drawer" size="xl">
        <form className="doc-form" onSubmit={createGrn}>
          <div className="form-grid two"><label>Purchase Order<select value={grnForm.purchaseOrderId} onChange={(e) => fillGrnFromPo(e.target.value)}><option value="">Receive without PO</option>{orders.filter(o => !['RECEIVED', 'CANCELLED'].includes(o.status)).map(order => <option key={order.id} value={order.id}>{order.purchaseNo} — {order.supplier?.name || 'No supplier'}</option>)}</select></label><label>Supplier<select value={grnForm.supplierId} onChange={(e) => setGrnForm({ ...grnForm, supplierId: e.target.value })}><option value="">No supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Paid Amount<input type="number" min="0" step="0.01" value={grnForm.paid} onChange={(e) => setGrnForm({ ...grnForm, paid: e.target.value })} /></label><label>Payment Method<select value={grnForm.paymentMethod} onChange={(e) => setGrnForm({ ...grnForm, paymentMethod: e.target.value })}><option>CASH</option><option>CARD</option><option>BANK_TRANSFER</option><option>CHEQUE</option><option>ONLINE</option></select></label><label className="span-two">Notes<input value={grnForm.notes} onChange={(e) => setGrnForm({ ...grnForm, notes: e.target.value })} placeholder="Supplier invoice number, transport details, remarks..." /></label></div>
          <ItemRows formName="grn" items={grnForm.items} />
          <div className="doc-total-strip"><div><span>Total</span><strong>{money(grnTotal)}</strong></div></div>
          <div className="doc-actions-footer"><button type="button" className="secondary-btn" onClick={() => addItem('grn')}>+ Add Item</button><button className="primary-btn">Post GRN & Update Stock</button></div>
        </form>
      </ModalDrawer>

      <ModalDrawer open={drawer === 'po'} onClose={() => setDrawer(null)} title="Create Purchase Order" description="Prepare supplier order before stock arrives." mode="drawer" size="xl">
        <form className="doc-form" onSubmit={createPurchaseOrder}>
          <div className="form-grid two"><label>Supplier<select value={poForm.supplierId} onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}><option value="">No supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Expected Date<input type="date" value={poForm.expectedDate} onChange={(e) => setPoForm({ ...poForm, expectedDate: e.target.value })} /></label><label className="span-two">Notes<input value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} placeholder="Purchase remarks" /></label></div>
          <ItemRows formName="po" items={poForm.items} />
          <div className="doc-total-strip"><div><span>Total</span><strong>{money(poTotal)}</strong></div></div>
          <div className="doc-actions-footer"><button type="button" className="secondary-btn" onClick={() => addItem('po')}>+ Add Item</button><button className="primary-btn">Create Purchase Order</button></div>
        </form>
      </ModalDrawer>

      <ModalDrawer open={Boolean(selectedRow)} onClose={() => setSelected(null)} title={selectedRow?.grnNo || selectedRow?.purchaseNo || 'Purchase Document'} description={`${selectedType || ''} details`} mode="modal" size="lg">
        {selectedRow && <div className="doc-detail-grid"><div className="detail-card"><span>Supplier</span><strong>{selectedRow.supplier?.name || '-'}</strong></div><div className="detail-card"><span>Status</span><strong>{selectedRow.status || '-'}</strong></div><div className="detail-card"><span>Total</span><strong>{money(selectedRow.total)}</strong></div><div className="detail-card"><span>Balance</span><strong>{money(selectedRow.balance)}</strong></div></div>}
      </ModalDrawer>
    </div>
  );
}
