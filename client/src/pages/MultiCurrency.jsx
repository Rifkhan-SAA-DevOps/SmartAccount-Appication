import { useEffect, useMemo, useState } from 'react';
import { BellRing, Calculator, Coins, RefreshCw, Repeat2 } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const emptyCurrency = { code: '', name: '', symbol: '', decimalPlaces: 2, isBase: false, isActive: true, notes: '' };
const emptyRate = { fromCurrency: 'USD', toCurrency: 'LKR', rate: 0, rateDate: '', source: 'Manual', notes: '' };
const emptyAssign = { entityType: 'CUSTOMER', entityId: '', currencyCode: 'USD', foreignBalance: 0, exchangeRate: 1 };
const emptyRevalue = { entityType: 'CUSTOMER', entityId: '', newRate: 1, notes: '', postJournal: true };
const emptyConvert = { amount: 100, fromCurrency: 'USD', toCurrency: 'LKR' };

function money(value) { return `LKR ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }

export default function MultiCurrency() {
  const [summary, setSummary] = useState(null);
  const [currencies, setCurrencies] = useState([]);
  const [rates, setRates] = useState([]);
  const [exposure, setExposure] = useState({ customers: [], suppliers: [], banks: [] });
  const [revaluations, setRevaluations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [currencyForm, setCurrencyForm] = useState(emptyCurrency);
  const [rateForm, setRateForm] = useState(emptyRate);
  const [assignForm, setAssignForm] = useState(emptyAssign);
  const [revalueForm, setRevalueForm] = useState(emptyRevalue);
  const [convertForm, setConvertForm] = useState(emptyConvert);
  const [conversion, setConversion] = useState(null);
  const [tab, setTab] = useState('exposure');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const [summaryRes, currenciesRes, ratesRes, exposureRes, revalRes, customerRes, supplierRes, bankRes] = await Promise.all([
      api.get('/multi-currency/summary'),
      api.get('/multi-currency/currencies'),
      api.get('/multi-currency/rates'),
      api.get('/multi-currency/exposure'),
      api.get('/multi-currency/revaluations'),
      api.get('/customers'),
      api.get('/suppliers'),
      api.get('/cashbank/accounts')
    ]);
    setSummary(summaryRes.data);
    setCurrencies(currenciesRes.data || []);
    setRates(ratesRes.data || []);
    setExposure(exposureRes.data || { customers: [], suppliers: [], banks: [] });
    setRevaluations(revalRes.data || []);
    setCustomers(customerRes.data || []);
    setSuppliers(supplierRes.data || []);
    setBanks(bankRes.data || []);
    const base = summaryRes.data?.baseCurrency || 'LKR';
    setRateForm((old) => ({ ...old, toCurrency: old.toCurrency || base }));
    setAssignForm((old) => ({ ...old, currencyCode: old.currencyCode || currenciesRes.data?.find((c) => !c.isBase)?.code || 'USD' }));
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load multi-currency data')); }, []);

  function flash(message) { setSuccess(message); setTimeout(() => setSuccess(''), 3500); }

  const currencyOptions = useMemo(() => currencies.filter((c) => c.isActive), [currencies]);
  const assignOptions = useMemo(() => {
    if (assignForm.entityType === 'CUSTOMER') return customers.map((x) => ({ id: x.id, name: x.name }));
    if (assignForm.entityType === 'SUPPLIER') return suppliers.map((x) => ({ id: x.id, name: x.name }));
    return banks.map((x) => ({ id: x.id, name: x.name }));
  }, [assignForm.entityType, customers, suppliers, banks]);
  const revalueOptions = useMemo(() => {
    if (revalueForm.entityType === 'CUSTOMER') return exposure.customers.map((x) => ({ id: x.id, name: x.entityName || x.name, currencyCode: x.currencyCode, exchangeRate: x.exchangeRate }));
    if (revalueForm.entityType === 'SUPPLIER') return exposure.suppliers.map((x) => ({ id: x.id, name: x.entityName || x.name, currencyCode: x.currencyCode, exchangeRate: x.exchangeRate }));
    return exposure.banks.map((x) => ({ id: x.id, name: x.entityName || x.name, currencyCode: x.currencyCode, exchangeRate: x.exchangeRate }));
  }, [revalueForm.entityType, exposure]);

  async function saveCurrency(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/multi-currency/currencies', { ...currencyForm, decimalPlaces: Number(currencyForm.decimalPlaces || 2) });
      setCurrencyForm(emptyCurrency); flash('Currency saved'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save currency'); }
    finally { setSaving(false); }
  }

  async function saveRate(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/multi-currency/rates', { ...rateForm, rate: Number(rateForm.rate || 0), rateDate: rateForm.rateDate || undefined });
      setRateForm({ ...emptyRate, toCurrency: summary?.baseCurrency || 'LKR' }); flash('Exchange rate saved'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save exchange rate'); }
    finally { setSaving(false); }
  }

  async function convertAmount(e) {
    e.preventDefault(); setError(''); setConversion(null);
    try {
      const { data } = await api.post('/multi-currency/convert', { ...convertForm, amount: Number(convertForm.amount || 0) });
      setConversion(data);
    } catch (e) { setError(e.response?.data?.message || 'Failed to convert amount'); }
  }

  async function assignCurrency(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const base = assignForm.entityType === 'CUSTOMER' ? 'customers' : assignForm.entityType === 'SUPPLIER' ? 'suppliers' : 'banks';
      await api.post(`/multi-currency/${base}/${assignForm.entityId}/currency`, { currencyCode: assignForm.currencyCode, foreignBalance: Number(assignForm.foreignBalance || 0), exchangeRate: Number(assignForm.exchangeRate || 1) });
      flash('Foreign currency balance assigned'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to assign currency'); }
    finally { setSaving(false); }
  }

  async function postRevaluation(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/multi-currency/revaluations', { ...revalueForm, newRate: Number(revalueForm.newRate || 1) });
      flash('Currency revaluation completed'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to revalue balance'); }
    finally { setSaving(false); }
  }

  async function createAlerts() {
    setError('');
    try { const { data } = await api.post('/multi-currency/alerts'); flash(`${data.created} alert(s) created for ${data.exposures} exposures`); }
    catch (e) { setError(e.response?.data?.message || 'Failed to create alerts'); }
  }

  const exposureColumns = [
    { key: 'entityName', label: 'Name', render: (r) => <><strong>{r.entityName || r.name}</strong><span className="table-subtext">{r.entityType} · {r.currencyCode}</span></> },
    { key: 'foreignBalance', label: 'Foreign Balance', render: (r) => <><strong>{r.currencyCode} {Number(r.foreignBalance || 0).toLocaleString()}</strong><span className="table-subtext">Rate {Number(r.exchangeRate || 1).toFixed(6)}</span></> },
    { key: 'baseBalance', label: 'Base Balance', render: (r) => <strong>{money(r.baseBalance || r.balance || r.currentBalance)}</strong> },
    { key: 'actions', label: 'Actions', render: (r) => <button className="mini-action" onClick={() => { setRevalueForm({ entityType: r.entityType, entityId: r.id, newRate: Number(r.exchangeRate || 1), notes: '', postJournal: true }); setTab('revaluation'); }}>Revalue</button> }
  ];

  return <div className="page multi-currency-page">
    <div className="page-head">
      <div><h1>Multi-currency / Exchange Rates</h1><p>Manage currencies, exchange rates, foreign balances, exposure and gain/loss revaluation journals.</p></div>
      <div className="actions-row"><button className="secondary-btn" onClick={createAlerts}><BellRing size={18}/> Alerts</button><button className="secondary-btn" onClick={load}><RefreshCw size={18}/> Refresh</button></div>
    </div>

    {error && <div className="error-box">{error}</div>}
    {success && <div className="success-box">{success}</div>}

    <div className="stat-grid currency-stat-grid">
      <StatCard title="Base Currency" value={summary?.baseCurrency || 'LKR'} subtitle="Tenant base currency" />
      <StatCard title="Currencies" value={summary?.currencies || 0} subtitle={`${summary?.rates || 0} rates`} tone="blue" />
      <StatCard title="Net Exposure" value={money(summary?.netExposure)} subtitle="Customer + bank - supplier" tone="orange" />
      <StatCard title="Foreign Entities" value={(summary?.foreignCustomers || 0) + (summary?.foreignSuppliers || 0) + (summary?.foreignBanks || 0)} subtitle="Customer / supplier / bank" tone="green" />
    </div>

    <div className="tab-actions">
      {['exposure','currencies','rates','assign','revaluation'].map((x)=><button key={x} className={`tab-btn ${tab===x?'active':''}`} onClick={()=>setTab(x)}>{x}</button>)}
    </div>

    {tab === 'exposure' && <div className="panel">
      <h2><Coins size={20}/> Foreign Currency Exposure</h2>
      <DataTable columns={exposureColumns} rows={[...(exposure.customers || []), ...(exposure.suppliers || []), ...(exposure.banks || [])]} empty="No foreign currency exposure yet" />
    </div>}

    {tab === 'currencies' && <div className="currency-grid">
      <section className="panel"><h2>Currency Master</h2><DataTable columns={[{key:'code',label:'Code'},{key:'name',label:'Name'},{key:'symbol',label:'Symbol'},{key:'isBase',label:'Base',render:(r)=><span className={`badge ${r.isBase?'paid':'partial'}`}>{r.isBase?'YES':'NO'}</span>},{key:'isActive',label:'Status',render:(r)=><span className={`badge ${r.isActive?'paid':'cancelled'}`}>{r.isActive?'ACTIVE':'INACTIVE'}</span>}]} rows={currencies} /></section>
      <form className="panel form-grid compact" onSubmit={saveCurrency}><h2>Add / Update Currency</h2><label>Code<input required maxLength="3" value={currencyForm.code} onChange={(e)=>setCurrencyForm({...currencyForm,code:e.target.value.toUpperCase()})} placeholder="USD" /></label><label>Name<input required value={currencyForm.name} onChange={(e)=>setCurrencyForm({...currencyForm,name:e.target.value})} /></label><label>Symbol<input value={currencyForm.symbol} onChange={(e)=>setCurrencyForm({...currencyForm,symbol:e.target.value})} /></label><label>Decimals<input type="number" min="0" max="6" value={currencyForm.decimalPlaces} onChange={(e)=>setCurrencyForm({...currencyForm,decimalPlaces:e.target.value})} /></label><label className="check-label"><input type="checkbox" checked={currencyForm.isBase} onChange={(e)=>setCurrencyForm({...currencyForm,isBase:e.target.checked})}/> Base currency</label><label className="check-label"><input type="checkbox" checked={currencyForm.isActive} onChange={(e)=>setCurrencyForm({...currencyForm,isActive:e.target.checked})}/> Active</label><button className="primary-btn" disabled={saving}>Save Currency</button></form>
    </div>}

    {tab === 'rates' && <div className="currency-grid">
      <section className="panel"><h2>Exchange Rates</h2><DataTable columns={[{key:'pair',label:'Pair',render:(r)=><strong>{r.fromCurrency} → {r.toCurrency}</strong>},{key:'rate',label:'Rate',render:(r)=>Number(r.rate||0).toFixed(6)},{key:'rateDate',label:'Date',render:(r)=>dateOnly(r.rateDate)},{key:'source',label:'Source'}]} rows={rates} /></section>
      <div className="panel stacked-forms"><form className="form-grid compact" onSubmit={saveRate}><h2>New Rate</h2><label>From<select value={rateForm.fromCurrency} onChange={(e)=>setRateForm({...rateForm,fromCurrency:e.target.value})}>{currencyOptions.map((c)=><option key={c.code}>{c.code}</option>)}</select></label><label>To<select value={rateForm.toCurrency} onChange={(e)=>setRateForm({...rateForm,toCurrency:e.target.value})}>{currencyOptions.map((c)=><option key={c.code}>{c.code}</option>)}</select></label><label>Rate<input type="number" step="0.000001" min="0" value={rateForm.rate} onChange={(e)=>setRateForm({...rateForm,rate:e.target.value})}/></label><label>Date<input type="date" value={rateForm.rateDate} onChange={(e)=>setRateForm({...rateForm,rateDate:e.target.value})}/></label><button className="primary-btn" disabled={saving}>Save Rate</button></form><form className="form-grid compact" onSubmit={convertAmount}><h2><Calculator size={18}/> Converter</h2><label>Amount<input type="number" value={convertForm.amount} onChange={(e)=>setConvertForm({...convertForm,amount:e.target.value})}/></label><label>From<select value={convertForm.fromCurrency} onChange={(e)=>setConvertForm({...convertForm,fromCurrency:e.target.value})}>{currencyOptions.map((c)=><option key={c.code}>{c.code}</option>)}</select></label><label>To<select value={convertForm.toCurrency} onChange={(e)=>setConvertForm({...convertForm,toCurrency:e.target.value})}>{currencyOptions.map((c)=><option key={c.code}>{c.code}</option>)}</select></label><button className="secondary-btn">Convert</button>{conversion && <div className="conversion-result"><strong>{conversion.convertedAmount}</strong><span>{conversion.amount} {conversion.fromCurrency} × {conversion.rate}</span></div>}</form></div>
    </div>}

    {tab === 'assign' && <div className="currency-grid">
      <form className="panel form-grid compact" onSubmit={assignCurrency}><h2>Assign Foreign Balance</h2><label>Entity Type<select value={assignForm.entityType} onChange={(e)=>setAssignForm({...assignForm,entityType:e.target.value,entityId:''})}>{['CUSTOMER','SUPPLIER','BANK'].map((x)=><option key={x}>{x}</option>)}</select></label><label>Entity<select required value={assignForm.entityId} onChange={(e)=>setAssignForm({...assignForm,entityId:e.target.value})}><option value="">Select entity</option>{assignOptions.map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Currency<select value={assignForm.currencyCode} onChange={(e)=>setAssignForm({...assignForm,currencyCode:e.target.value})}>{currencyOptions.map((c)=><option key={c.code}>{c.code}</option>)}</select></label><label>Foreign Balance<input type="number" step="0.01" value={assignForm.foreignBalance} onChange={(e)=>setAssignForm({...assignForm,foreignBalance:e.target.value})}/></label><label>Exchange Rate<input type="number" step="0.000001" value={assignForm.exchangeRate} onChange={(e)=>setAssignForm({...assignForm,exchangeRate:e.target.value})}/></label><button className="primary-btn" disabled={saving}>Assign Currency</button></form>
      <section className="panel"><h2>Current Exposure</h2><DataTable columns={exposureColumns} rows={[...(exposure.customers || []), ...(exposure.suppliers || []), ...(exposure.banks || [])]} empty="No foreign balances" /></section>
    </div>}

    {tab === 'revaluation' && <div className="currency-grid">
      <form className="panel form-grid compact" onSubmit={postRevaluation}><h2><Repeat2 size={18}/> Revalue Balance</h2><label>Entity Type<select value={revalueForm.entityType} onChange={(e)=>setRevalueForm({...revalueForm,entityType:e.target.value,entityId:''})}>{['CUSTOMER','SUPPLIER','BANK'].map((x)=><option key={x}>{x}</option>)}</select></label><label>Entity<select required value={revalueForm.entityId} onChange={(e)=>setRevalueForm({...revalueForm,entityId:e.target.value})}><option value="">Select exposure</option>{revalueOptions.map((x)=><option key={x.id} value={x.id}>{x.name} · {x.currencyCode} · old {Number(x.exchangeRate || 1).toFixed(6)}</option>)}</select></label><label>New Rate<input type="number" step="0.000001" value={revalueForm.newRate} onChange={(e)=>setRevalueForm({...revalueForm,newRate:e.target.value})}/></label><label>Notes<input value={revalueForm.notes} onChange={(e)=>setRevalueForm({...revalueForm,notes:e.target.value})}/></label><label className="check-label"><input type="checkbox" checked={revalueForm.postJournal} onChange={(e)=>setRevalueForm({...revalueForm,postJournal:e.target.checked})}/> Post gain/loss journal entry</label><button className="primary-btn" disabled={saving}>Post Revaluation</button></form>
      <section className="panel"><h2>Revaluation History</h2><DataTable columns={[{key:'entityName',label:'Entity'},{key:'currencyCode',label:'Currency'},{key:'rate',label:'Rates',render:(r)=>`${Number(r.oldRate||0).toFixed(6)} → ${Number(r.newRate||0).toFixed(6)}`},{key:'gainLoss',label:'Gain / Loss',render:(r)=><strong>{money(r.gainLoss)}</strong>},{key:'posted',label:'Journal',render:(r)=><span className={`badge ${r.posted?'paid':'partial'}`}>{r.posted?'POSTED':'NOT POSTED'}</span>}]} rows={revaluations} empty="No revaluations yet" /></section>
    </div>}
  </div>;
}
