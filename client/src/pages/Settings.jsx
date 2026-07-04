import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import { useAuth } from '../state/AuthContext.jsx';
import { uploadBusinessFile } from '../utils/uploadFile.js';

const EMPTY_FORM = {
  name: '', businessType: 'shop', email: '', phone: '', logoUrl: '', currency: 'LKR', timezone: 'Asia/Colombo',
  legalName: '', address: '', taxNumber: '', website: '', invoicePrefix: 'INV', receiptPrefix: 'REC',
  invoiceTemplate: 'modern', invoiceAccentColor: '#7c3aed', invoiceFooter: 'Thank you for your business.',
  invoiceTerms: 'Payment is due according to the agreed terms.', showLogo: true, showTaxNumber: true
};

export default function Settings() {
  const { tenant } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [taxRates, setTaxRates] = useState([]);
  const [taxForm, setTaxForm] = useState({ name: '', rate: 0, isDefault: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/settings');
      setForm({
        ...EMPTY_FORM,
        name: data.tenant?.name || tenant?.name || '',
        businessType: data.tenant?.businessType || 'shop',
        email: data.tenant?.email || '',
        phone: data.tenant?.phone || '',
        logoUrl: data.tenant?.logoUrl || '',
        currency: data.tenant?.currency || 'LKR',
        timezone: data.tenant?.timezone || 'Asia/Colombo',
        legalName: data.settings?.legalName || data.tenant?.name || '',
        address: data.settings?.address || '',
        taxNumber: data.settings?.taxNumber || '',
        website: data.settings?.website || '',
        invoicePrefix: data.settings?.invoicePrefix || 'INV',
        receiptPrefix: data.settings?.receiptPrefix || 'REC',
        invoiceTemplate: data.settings?.invoiceTemplate || 'modern',
        invoiceAccentColor: data.settings?.invoiceAccentColor || '#7c3aed',
        invoiceFooter: data.settings?.invoiceFooter || 'Thank you for your business.',
        invoiceTerms: data.settings?.invoiceTerms || 'Payment is due according to the agreed terms.',
        showLogo: data.settings?.showLogo ?? true,
        showTaxNumber: data.settings?.showTaxNumber ?? true
      });
      setTaxRates(data.taxRates || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function setValue(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }


  async function handleLogoUpload(file) {
    if (!file) return;
    setUploadingLogo(true); setError(''); setSuccess('');
    try {
      const doc = await uploadBusinessFile(file, { purpose: 'LOGO', folder: 'logos' });
      setValue('logoUrl', doc.publicUrl || '');
      setSuccess('Logo uploaded to S3 and applied to company profile.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Logo upload failed');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function saveCompany(e) {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try {
      await api.put('/settings/company', form);
      setSuccess('Company branding, invoice template and tax profile saved. Login again later to refresh the top bar company name.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function saveTax(e) {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      await api.post('/settings/tax-rates', { ...taxForm, rate: Number(taxForm.rate) });
      setTaxForm({ name: '', rate: 0, isDefault: false });
      setSuccess('Tax rate saved.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save tax rate');
    }
  }

  async function makeDefault(id) {
    setError(''); setSuccess('');
    try { await api.patch(`/settings/tax-rates/${id}/default`); setSuccess('Default tax rate updated.'); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Failed to update default tax'); }
  }

  async function disableTax(id) {
    setError(''); setSuccess('');
    try { await api.delete(`/settings/tax-rates/${id}`); setSuccess('Tax rate disabled.'); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Failed to disable tax'); }
  }

  const previewTotals = useMemo(() => {
    const subtotal = 10000;
    const discount = 500;
    const defaultTax = taxRates.find((t) => t.isDefault && t.isActive);
    const tax = (subtotal - discount) * Number(defaultTax?.rate || 0) / 100;
    return { subtotal, discount, tax, total: subtotal - discount + tax, defaultTax };
  }, [taxRates]);

  if (loading) return <div className="page"><section className="panel">Loading settings...</section></div>;

  return (
    <div className="page settings-page">
      <div className="page-head"><div><h1>Company Settings</h1><p>Brand your company, create tax rates and customize printable invoices.</p></div></div>
      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="settings-grid">
        <section className="panel">
          <h2>Company Branding</h2>
          <form onSubmit={saveCompany} className="form-grid two">
            <label>Display Company Name<input value={form.name} onChange={(e)=>setValue('name', e.target.value)} /></label>
            <label>Legal Invoice Name<input value={form.legalName} onChange={(e)=>setValue('legalName', e.target.value)} /></label>
            <label>Business Type<input value={form.businessType} onChange={(e)=>setValue('businessType', e.target.value)} /></label>
            <label>Currency<input value={form.currency} onChange={(e)=>setValue('currency', e.target.value)} /></label>
            <label>Email<input value={form.email} onChange={(e)=>setValue('email', e.target.value)} /></label>
            <label>Phone<input value={form.phone} onChange={(e)=>setValue('phone', e.target.value)} /></label>
            <label className="span-two">Logo URL<input placeholder="https://.../logo.png" value={form.logoUrl} onChange={(e)=>setValue('logoUrl', e.target.value)} /></label>
            <label className="span-two file-drop compact-upload">
              <input type="file" accept="image/*" onChange={(e)=>handleLogoUpload(e.target.files?.[0])} disabled={uploadingLogo} />
              <strong>{uploadingLogo ? 'Uploading logo...' : 'Upload logo to AWS S3'}</strong>
              <span>PNG, JPG, WEBP, SVG. This automatically updates the logo URL.</span>
            </label>
            <label className="span-two">Business Address<textarea value={form.address} onChange={(e)=>setValue('address', e.target.value)} /></label>
            <label>Tax / VAT Number<input value={form.taxNumber} onChange={(e)=>setValue('taxNumber', e.target.value)} /></label>
            <label>Website<input value={form.website} onChange={(e)=>setValue('website', e.target.value)} /></label>
            <label>Timezone<input value={form.timezone} onChange={(e)=>setValue('timezone', e.target.value)} /></label>
            <label>Accent Color<input type="color" value={form.invoiceAccentColor} onChange={(e)=>setValue('invoiceAccentColor', e.target.value)} /></label>

            <h2 className="span-two section-subtitle">Invoice Template</h2>
            <label>Invoice Prefix<input value={form.invoicePrefix} onChange={(e)=>setValue('invoicePrefix', e.target.value.toUpperCase())} /></label>
            <label>Receipt Prefix<input value={form.receiptPrefix} onChange={(e)=>setValue('receiptPrefix', e.target.value.toUpperCase())} /></label>
            <label>Template<select value={form.invoiceTemplate} onChange={(e)=>setValue('invoiceTemplate', e.target.value)}><option value="modern">Modern</option><option value="classic">Classic</option><option value="compact">Compact</option></select></label>
            <label className="check-label"><input type="checkbox" checked={form.showLogo} onChange={(e)=>setValue('showLogo', e.target.checked)} /> Show logo on invoice</label>
            <label className="check-label"><input type="checkbox" checked={form.showTaxNumber} onChange={(e)=>setValue('showTaxNumber', e.target.checked)} /> Show tax number on invoice</label>
            <label className="span-two">Invoice Terms<textarea value={form.invoiceTerms} onChange={(e)=>setValue('invoiceTerms', e.target.value)} /></label>
            <label className="span-two">Invoice Footer<textarea value={form.invoiceFooter} onChange={(e)=>setValue('invoiceFooter', e.target.value)} /></label>
            <div className="span-two"><button className="primary-btn" disabled={saving}>{saving ? 'Saving...' : 'Save Company Settings'}</button></div>
          </form>
        </section>

        <aside className="panel invoice-preview-panel">
          <h2>Live Invoice Preview</h2>
          <div className="mini-invoice" style={{ '--preview-accent': form.invoiceAccentColor }}>
            <div className="mini-invoice-head">
              <div className="mini-logo">{form.showLogo && form.logoUrl ? <img src={form.logoUrl} alt="Logo" /> : (form.legalName || form.name || 'S').charAt(0)}</div>
              <div><strong>{form.legalName || form.name || 'Company Name'}</strong><span>{form.address || 'Company address'}</span>{form.showTaxNumber && form.taxNumber && <span>Tax No: {form.taxNumber}</span>}</div>
            </div>
            <div className="mini-invoice-title"><span>INVOICE</span><strong>{form.invoicePrefix || 'INV'}1001</strong></div>
            <div className="mini-invoice-line"><span>Subtotal</span><strong>LKR {previewTotals.subtotal.toFixed(2)}</strong></div>
            <div className="mini-invoice-line"><span>Discount</span><strong>LKR {previewTotals.discount.toFixed(2)}</strong></div>
            <div className="mini-invoice-line"><span>{previewTotals.defaultTax?.name || 'Tax'} </span><strong>LKR {previewTotals.tax.toFixed(2)}</strong></div>
            <div className="mini-invoice-line total"><span>Total</span><strong>LKR {previewTotals.total.toFixed(2)}</strong></div>
            <p>{form.invoiceFooter}</p>
          </div>
        </aside>
      </div>

      <section className="panel">
        <div className="panel-head-inline"><div><h2>Tax Settings</h2><p>Create VAT/GST/Service Charge style tax rates. The default tax appears automatically in invoices.</p></div></div>
        <form onSubmit={saveTax} className="form-grid tax-form-grid">
          <label>Tax Name<input placeholder="VAT 18%" value={taxForm.name} onChange={(e)=>setTaxForm({...taxForm, name:e.target.value})} /></label>
          <label>Rate %<input type="number" step="0.01" min="0" value={taxForm.rate} onChange={(e)=>setTaxForm({...taxForm, rate:e.target.value})} /></label>
          <label className="check-label"><input type="checkbox" checked={taxForm.isDefault} onChange={(e)=>setTaxForm({...taxForm, isDefault:e.target.checked})} /> Make default</label>
          <button className="primary-btn">Add Tax Rate</button>
        </form>
        <div className="tax-rate-list">
          {taxRates.map((tax) => <div key={tax.id} className={!tax.isActive ? 'disabled-tax' : ''}>
            <span><b>{tax.name}</b><small>{Number(tax.rate).toFixed(2)}% {tax.isDefault ? '• Default' : ''} {!tax.isActive ? '• Disabled' : ''}</small></span>
            <div className="tax-actions">
              {tax.isActive && !tax.isDefault && <button className="mini-action" onClick={()=>makeDefault(tax.id)}>Set default</button>}
              {tax.isActive && <button className="mini-danger" onClick={()=>disableTax(tax.id)}>Disable</button>}
            </div>
          </div>)}
          {!taxRates.length && <p className="muted">No tax rates yet.</p>}
        </div>
      </section>
    </div>
  );
}
