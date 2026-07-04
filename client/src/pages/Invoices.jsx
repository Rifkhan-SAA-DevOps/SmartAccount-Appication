import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import { uploadBusinessFile } from '../utils/uploadFile.js';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [form, setForm] = useState({
    customerId: '', paid: 0, paymentMethod: 'CASH', discount: 0, taxRateId: '', notes: '',
    items: [{ productId: '', description: '', qty: 1, unitPrice: 0, discount: 0 }]
  });

  async function load() {
    const [i, c, p, s] = await Promise.all([api.get('/invoices'), api.get('/customers'), api.get('/products'), api.get('/settings')]);
    setInvoices(i.data); setCustomers(c.data); setProducts(p.data);
    const activeTaxes = (s.data.taxRates || []).filter((t) => t.isActive);
    setTaxRates(activeTaxes);
    if (!form.taxRateId) {
      const defaultTax = activeTaxes.find((t) => t.isDefault);
      if (defaultTax) setForm((prev) => ({ ...prev, taxRateId: defaultTax.id }));
    }
  }
  useEffect(() => { load().catch(e=>setError(e.response?.data?.message || 'Failed')); }, []);

  const subtotal = useMemo(() => form.items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0) - Number(it.discount || 0), 0), [form.items]);
  const selectedTax = taxRates.find((tax) => tax.id === form.taxRateId);
  const taxable = Math.max(subtotal - Number(form.discount || 0), 0);
  const taxAmount = selectedTax ? taxable * Number(selectedTax.rate || 0) / 100 : 0;
  const total = taxable + taxAmount;
  const balance = Math.max(total - Number(form.paid || 0), 0);

  function setItem(index, key, value) {
    const items = [...form.items]; items[index][key] = value;
    if (key === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) { items[index].description = product.name; items[index].unitPrice = product.salePrice; }
    }
    setForm({ ...form, items });
  }
  function addItem() { setForm({ ...form, items: [...form.items, { productId: '', description: '', qty: 1, unitPrice: 0, discount: 0 }] }); }
  function removeItem(index) { setForm({ ...form, items: form.items.filter((_, i) => i !== index) }); }

  async function submit(e) {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      const { data } = await api.post('/invoices', {
        ...form,
        customerId: form.customerId || null,
        taxRateId: form.taxRateId || null,
        paid: Number(form.paid),
        discount: Number(form.discount || 0),
        items: form.items.map(it => ({...it, productId: it.productId || null, qty: Number(it.qty), unitPrice: Number(it.unitPrice), discount: Number(it.discount || 0)}))
      });
      let attachmentUploaded = false;
      if (attachmentFile && data?.id) {
        try {
          await uploadBusinessFile(attachmentFile, {
            purpose: 'INVOICE_ATTACHMENT',
            folder: 'invoices',
            entityType: 'Invoice',
            entityId: data.id
          });
          attachmentUploaded = true;
        } catch (uploadError) {
          setError(uploadError.response?.data?.message || uploadError.message || 'Invoice created, but attachment upload failed.');
        }
      }
      setSuccess(attachmentFile ? (attachmentUploaded ? `Invoice ${data.invoiceNo} created and attachment uploaded.` : `Invoice ${data.invoiceNo} created, but attachment was not uploaded.`) : `Invoice ${data.invoiceNo} created successfully.`);
      setForm({ customerId: '', paid: 0, paymentMethod: 'CASH', discount: 0, taxRateId: taxRates.find(t=>t.isDefault)?.id || '', notes: '', items: [{ productId: '', description: '', qty: 1, unitPrice: 0, discount: 0 }] });
      setAttachmentFile(null);
      load();
    }
    catch(e){ setError(e.response?.data?.message || 'Failed to create invoice'); }
  }

  async function printInvoice(id) {
    setError('');
    try {
      const { data } = await api.get(`/invoices/${id}/print`, { responseType: 'text' });
      const win = window.open('', '_blank');
      if (!win) return setError('Popup blocked. Allow popups to open invoice print preview.');
      win.document.open();
      win.document.write(data);
      win.document.close();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to open invoice print preview');
    }
  }

  return (
    <div className="page invoices-page">
      <div className="page-head"><div><h1>Invoices</h1><p>Create branded invoices, credit sales, tax and payments.</p></div></div>
      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}
      <section className="panel invoice-builder"><h2>New Invoice</h2><form onSubmit={submit}>
        <div className="form-grid four">
          <label>Customer<select value={form.customerId} onChange={(e)=>setForm({...form,customerId:e.target.value})}><option value="">Walk-in customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Discount<input type="number" value={form.discount} onChange={(e)=>setForm({...form,discount:e.target.value})} /></label>
          <label>Tax Rate<select value={form.taxRateId} onChange={(e)=>setForm({...form,taxRateId:e.target.value})}><option value="">No tax</option>{taxRates.map(t=><option key={t.id} value={t.id}>{t.name} ({Number(t.rate).toFixed(2)}%)</option>)}</select></label>
          <label>Paid Amount<input type="number" value={form.paid} onChange={(e)=>setForm({...form,paid:e.target.value})} /></label>
          <label>Payment Method<select value={form.paymentMethod} onChange={(e)=>setForm({...form,paymentMethod:e.target.value})}><option>CASH</option><option>CARD</option><option>BANK_TRANSFER</option><option>ONLINE</option><option>CREDIT</option></select></label>
          <label className="span-two">Notes<input value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} placeholder="Optional invoice notes" /></label>
          <label className="span-two file-drop compact-upload"><input type="file" accept="image/*,.pdf" onChange={(e)=>setAttachmentFile(e.target.files?.[0] || null)} /><strong>{attachmentFile ? attachmentFile.name : 'Attach invoice proof/document'}</strong><span>Optional: upload PDF/image to S3 after invoice creation.</span></label>
        </div>
        <div className="items-list">{form.items.map((item, i)=><div className="item-row invoice-item-row" key={i}>
          <select value={item.productId} onChange={(e)=>setItem(i,'productId',e.target.value)}><option value="">Manual item</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — stock {p.stockQty}</option>)}</select>
          <input placeholder="Description" value={item.description} onChange={(e)=>setItem(i,'description',e.target.value)} />
          <input type="number" min="1" value={item.qty} onChange={(e)=>setItem(i,'qty',e.target.value)} />
          <input type="number" value={item.unitPrice} onChange={(e)=>setItem(i,'unitPrice',e.target.value)} />
          <input type="number" value={item.discount} onChange={(e)=>setItem(i,'discount',e.target.value)} placeholder="Disc" />
          <strong>LKR {(Number(item.qty||0)*Number(item.unitPrice||0)-Number(item.discount||0)).toFixed(2)}</strong>
          <button type="button" className="mini-danger" onClick={()=>removeItem(i)} disabled={form.items.length===1}>×</button>
        </div>)}</div>
        <div className="invoice-summary-strip">
          <div><span>Subtotal</span><strong>LKR {subtotal.toFixed(2)}</strong></div>
          <div><span>Tax</span><strong>LKR {taxAmount.toFixed(2)}</strong></div>
          <div><span>Total</span><strong>LKR {total.toFixed(2)}</strong></div>
          <div><span>Balance</span><strong>LKR {balance.toFixed(2)}</strong></div>
        </div>
        <div className="invoice-actions"><button type="button" className="secondary-btn" onClick={addItem}>+ Add Item</button><button className="primary-btn">Create Invoice</button></div>
      </form></section>
      <section className="panel"><h2>Recent Invoices</h2><DataTable columns={[{key:'invoiceNo',label:'No'},{key:'customer',label:'Customer',render:r=>r.customer?.name||'Walk-in'},{key:'tax',label:'Tax',render:r=>`LKR ${r.tax}`},{key:'total',label:'Total',render:r=>`LKR ${r.total}`},{key:'balance',label:'Balance',render:r=>`LKR ${r.balance}`},{key:'status',label:'Status',render:r=><span className={`badge ${String(r.status).toLowerCase()}`}>{r.status}</span>},{key:'print',label:'PDF / Print',render:r=><button className="mini-action" onClick={()=>printInvoice(r.id)}>Open</button>}]} rows={invoices}/></section>
    </div>
  );
}
