import { useEffect, useMemo, useState } from 'react';
import { BellRing, Gift, RefreshCw, Sparkles, TicketPercent, UserPlus } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const emptyTier = { name: '', minPoints: 0, discountPercent: 0, pointsMultiplier: 1, priority: 10, isActive: true };
const emptyRule = { name: '', earnAmountStep: 100, earnPoints: 1, redemptionValue: 1, minRedeemPoints: 100, expiryDays: '', isDefault: false, isActive: true };
const emptyAction = { customerId: '', amount: 0, points: 0, description: '' };

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function dt(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function statusClass(status, expired = false) {
  if (expired) return 'cancelled';
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'paid';
  if (s === 'redeemed') return 'partial';
  if (s === 'expired' || s === 'cancelled') return 'cancelled';
  return 'unpaid';
}

export default function Loyalty() {
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [rules, setRules] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [tierForm, setTierForm] = useState(emptyTier);
  const [ruleForm, setRuleForm] = useState(emptyRule);
  const [actionForm, setActionForm] = useState(emptyAction);
  const [filters, setFilters] = useState({ q: '', status: '' });
  const [tab, setTab] = useState('members');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [summaryRes, customerRes, accountRes, tierRes, ruleRes, voucherRes] = await Promise.all([
      api.get('/loyalty/summary'),
      api.get('/customers'),
      api.get('/loyalty/accounts', { params }),
      api.get('/loyalty/tiers'),
      api.get('/loyalty/rules'),
      api.get('/loyalty/vouchers')
    ]);
    setSummary(summaryRes.data);
    setCustomers(customerRes.data || []);
    setAccounts(accountRes.data || []);
    setTiers(tierRes.data || []);
    setRules(ruleRes.data || []);
    setVouchers(voucherRes.data || []);
    setActionForm((old) => ({ ...old, customerId: old.customerId || customerRes.data?.[0]?.id || '' }));
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load loyalty module')); }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  const defaultRule = useMemo(() => rules.find((r) => r.isDefault) || rules[0], [rules]);
  const selectedCustomer = customers.find((c) => c.id === actionForm.customerId);
  const selectedAccount = accounts.find((a) => a.customerId === actionForm.customerId);

  async function enrollCustomer(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/loyalty/enroll', { customerId: actionForm.customerId, notes: actionForm.description || 'Manual enrollment' });
      flash('Customer enrolled in loyalty program');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to enroll customer'); }
    finally { setSaving(false); }
  }

  async function earnPoints(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/loyalty/earn', { customerId: actionForm.customerId, amount: Number(actionForm.amount || 0), description: actionForm.description || 'Manual points earning' });
      setActionForm({ ...actionForm, amount: 0, description: '' });
      flash(`${data.points} point(s) earned`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to earn points'); }
    finally { setSaving(false); }
  }

  async function redeemPoints(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/loyalty/redeem', { customerId: actionForm.customerId, points: Number(actionForm.points || 0), notes: actionForm.description || 'Reward redemption' });
      setActionForm({ ...actionForm, points: 0, description: '' });
      flash(`Voucher ${data.voucher.voucherNo} created for ${money(data.voucher.discountAmount)}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to redeem points'); }
    finally { setSaving(false); }
  }

  async function adjustPoints() {
    setSaving(true); setError('');
    try {
      await api.post('/loyalty/adjust', { customerId: actionForm.customerId, points: Number(actionForm.points || 0), description: actionForm.description || 'Manual adjustment', type: Number(actionForm.points || 0) > 0 ? 'BONUS' : 'ADJUST' });
      setActionForm({ ...actionForm, points: 0, description: '' });
      flash('Points adjusted');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to adjust points'); }
    finally { setSaving(false); }
  }

  async function saveTier(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/loyalty/tiers', { ...tierForm, minPoints: Number(tierForm.minPoints || 0), discountPercent: Number(tierForm.discountPercent || 0), pointsMultiplier: Number(tierForm.pointsMultiplier || 1), priority: Number(tierForm.priority || 0) });
      setTierForm(emptyTier);
      flash('Tier saved');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save tier'); }
    finally { setSaving(false); }
  }

  async function saveRule(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/loyalty/rules', { ...ruleForm, earnAmountStep: Number(ruleForm.earnAmountStep || 100), earnPoints: Number(ruleForm.earnPoints || 1), redemptionValue: Number(ruleForm.redemptionValue || 1), minRedeemPoints: Number(ruleForm.minRedeemPoints || 100), expiryDays: ruleForm.expiryDays ? Number(ruleForm.expiryDays) : null });
      setRuleForm(emptyRule);
      flash('Loyalty rule saved');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save rule'); }
    finally { setSaving(false); }
  }

  async function redeemVoucher(voucher) {
    setError('');
    try {
      await api.post(`/loyalty/vouchers/${voucher.id}/redeem`, {});
      flash(`${voucher.voucherNo} marked as redeemed`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to redeem voucher'); }
  }

  async function generateAlerts() {
    setError('');
    try {
      const { data } = await api.post('/loyalty/alerts', { days: 7 });
      flash(`${data.created} voucher expiry alert(s) created`);
    } catch (e) { setError(e.response?.data?.message || 'Failed to create loyalty alerts'); }
  }

  const accountColumns = [
    { key: 'memberNo', label: 'Member', render: (r) => <><strong>{r.memberNo}</strong><span className="table-subtext">{r.customerName}</span></> },
    { key: 'phone', label: 'Contact', render: (r) => r.customerPhone || '-' },
    { key: 'tier', label: 'Tier', render: (r) => <><span className="badge paid">{r.tierName}</span><span className="table-subtext">Discount {Number(r.discountPercent || 0)}%</span></> },
    { key: 'pointsBalance', label: 'Balance', render: (r) => <><strong>{Number(r.pointsBalance || 0).toLocaleString()}</strong><span className="table-subtext">Lifetime {Number(r.lifetimeEarned || 0).toLocaleString()}</span></> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> }
  ];

  const voucherColumns = [
    { key: 'voucherNo', label: 'Voucher', render: (r) => <><strong>{r.voucherNo}</strong><span className="table-subtext">{r.customerName}</span></> },
    { key: 'pointsCost', label: 'Points', render: (r) => Number(r.pointsCost || 0).toLocaleString() },
    { key: 'discountAmount', label: 'Discount', render: (r) => money(r.discountAmount) },
    { key: 'expiresAt', label: 'Expiry', render: (r) => <>{dt(r.expiresAt)}{r.expired && <span className="table-subtext danger-text">Expired</span>}</> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status, r.expired)}`}>{r.expired ? 'EXPIRED' : r.status}</span> },
    { key: 'actions', label: 'Actions', render: (r) => r.status === 'ACTIVE' && !r.expired ? <button className="mini-action" onClick={() => redeemVoucher(r)}>Mark Redeemed</button> : '-' }
  ];

  const tierColumns = [
    { key: 'name', label: 'Tier' },
    { key: 'minPoints', label: 'Min Points', render: (r) => Number(r.minPoints || 0).toLocaleString() },
    { key: 'discountPercent', label: 'Discount', render: (r) => `${Number(r.discountPercent || 0)}%` },
    { key: 'pointsMultiplier', label: 'Multiplier', render: (r) => `${Number(r.pointsMultiplier || 1)}x` },
    { key: 'isActive', label: 'Status', render: (r) => <span className={`badge ${r.isActive ? 'paid' : 'cancelled'}`}>{r.isActive ? 'Active' : 'Inactive'}</span> }
  ];

  return <div className="page loyalty-page">
    <div className="page-header">
      <div>
        <span className="eyebrow">Customer loyalty / membership</span>
        <h1>Loyalty & Rewards</h1>
        <p>Manage member tiers, earn points, redeem rewards, vouchers, VIP discounts and customer retention.</p>
      </div>
      <div className="head-actions"><button className="ghost-btn" onClick={load}><RefreshCw size={16}/> Refresh</button><button className="primary-btn" onClick={generateAlerts}><BellRing size={16}/> Voucher alerts</button></div>
    </div>

    {error && <div className="error-box">{error}</div>}
    {success && <div className="success-box">{success}</div>}

    <div className="stat-grid report-stat-grid">
      <StatCard title="Members" value={summary?.members || 0} subtitle="Active loyalty accounts" />
      <StatCard title="Points Earned" value={Number(summary?.earned || 0).toLocaleString()} subtitle="Lifetime earning activity" tone="green" />
      <StatCard title="Points Redeemed" value={Number(summary?.redeemed || 0).toLocaleString()} subtitle="Rewards used" tone="orange" />
      <StatCard title="Active Vouchers" value={summary?.activeVouchers || 0} subtitle={`${summary?.redeemedVouchers || 0} redeemed`} tone="purple" />
    </div>

    <div className="tab-actions">
      {['members','actions','vouchers','tiers','rules'].map((key)=><button key={key} className={`tab-btn ${tab===key?'active':''}`} onClick={()=>setTab(key)}>{key}</button>)}
    </div>

    {tab === 'members' && <>
      <div className="panel loyalty-filter-panel">
        <div className="audit-filter-grid loyalty-filter-grid">
          <label className="span-two">Search<input value={filters.q} onChange={(e)=>setFilters({...filters,q:e.target.value})} placeholder="Member no, customer name, phone" /></label>
          <label>Status<select value={filters.status} onChange={(e)=>setFilters({...filters,status:e.target.value})}><option value="">All</option><option>ACTIVE</option><option>BLOCKED</option></select></label>
          <button className="primary-btn" onClick={load}>Apply</button>
        </div>
      </div>
      <DataTable columns={accountColumns} rows={accounts} empty="No loyalty members found" />
    </>}

    {tab === 'actions' && <div className="two-col-page loyalty-action-grid">
      <form className="panel form-grid" onSubmit={enrollCustomer}>
        <h2><UserPlus size={18}/> Member actions</h2>
        <label className="span-two">Customer<select value={actionForm.customerId} onChange={(e)=>setActionForm({...actionForm,customerId:e.target.value})} required><option value="">Select customer</option>{customers.map((c)=><option key={c.id} value={c.id}>{c.name} · {c.phone || '-'}</option>)}</select></label>
        {selectedCustomer && <div className="loyalty-member-preview span-two"><strong>{selectedCustomer.name}</strong><span>{selectedAccount ? `${selectedAccount.memberNo} · ${selectedAccount.pointsBalance} points · ${selectedAccount.tierName}` : 'Not enrolled yet'}</span></div>}
        <label>Sale amount for earning<input type="number" min="0" step="0.01" value={actionForm.amount} onChange={(e)=>setActionForm({...actionForm,amount:e.target.value})} /></label>
        <label>Points for redeem/adjust<input type="number" value={actionForm.points} onChange={(e)=>setActionForm({...actionForm,points:e.target.value})} /></label>
        <label className="span-two">Description<input value={actionForm.description} onChange={(e)=>setActionForm({...actionForm,description:e.target.value})} placeholder="Invoice number / campaign / reason" /></label>
        <div className="actions-row span-two loyalty-actions-row"><button className="secondary-btn" disabled={saving}><UserPlus size={16}/> Enroll</button><button type="button" className="primary-btn" onClick={earnPoints} disabled={saving}><Sparkles size={16}/> Earn Points</button><button type="button" className="primary-btn" onClick={redeemPoints} disabled={saving}><Gift size={16}/> Create Reward</button><button type="button" className="secondary-btn" onClick={adjustPoints} disabled={saving}>Adjust</button></div>
      </form>
      <div className="panel loyalty-help-panel"><h2><TicketPercent size={18}/> Current rule</h2>{defaultRule ? <div className="loyalty-rule-card"><strong>{defaultRule.name}</strong><span>Earn {defaultRule.earnPoints} point(s) per {money(defaultRule.earnAmountStep)}</span><span>Redeem value: {money(defaultRule.redemptionValue)} per point</span><span>Minimum redeem: {defaultRule.minRedeemPoints} points</span></div> : <p>No rule created yet.</p>}<div className="mini-list">{(summary?.topMembers || []).map((m)=><div key={m.id}><strong>{m.customerName}</strong><span>{m.memberNo} · {m.pointsBalance} points · {m.tierName}</span></div>)}</div></div>
    </div>}

    {tab === 'vouchers' && <DataTable columns={voucherColumns} rows={vouchers} empty="No reward vouchers found" />}

    {tab === 'tiers' && <div className="two-col-page loyalty-tier-grid">
      <form className="panel form-grid" onSubmit={saveTier}>
        <h2>New membership tier</h2>
        <label>Name<input required value={tierForm.name} onChange={(e)=>setTierForm({...tierForm,name:e.target.value})} placeholder="Silver / Gold / VIP" /></label>
        <label>Minimum points<input type="number" min="0" value={tierForm.minPoints} onChange={(e)=>setTierForm({...tierForm,minPoints:e.target.value})} /></label>
        <label>Discount %<input type="number" min="0" max="100" value={tierForm.discountPercent} onChange={(e)=>setTierForm({...tierForm,discountPercent:e.target.value})} /></label>
        <label>Points multiplier<input type="number" min="0" step="0.01" value={tierForm.pointsMultiplier} onChange={(e)=>setTierForm({...tierForm,pointsMultiplier:e.target.value})} /></label>
        <button className="primary-btn span-two" disabled={saving}>Save Tier</button>
      </form>
      <DataTable columns={tierColumns} rows={tiers} empty="No tiers found" />
    </div>}

    {tab === 'rules' && <div className="two-col-page loyalty-rule-grid">
      <form className="panel form-grid" onSubmit={saveRule}>
        <h2>Loyalty earning/redeem rule</h2>
        <label>Name<input required value={ruleForm.name} onChange={(e)=>setRuleForm({...ruleForm,name:e.target.value})} placeholder="Weekend reward / Default rule" /></label>
        <label>Earn amount step<input type="number" min="1" value={ruleForm.earnAmountStep} onChange={(e)=>setRuleForm({...ruleForm,earnAmountStep:e.target.value})} /></label>
        <label>Earn points<input type="number" min="1" value={ruleForm.earnPoints} onChange={(e)=>setRuleForm({...ruleForm,earnPoints:e.target.value})} /></label>
        <label>Value per point<input type="number" min="0" step="0.01" value={ruleForm.redemptionValue} onChange={(e)=>setRuleForm({...ruleForm,redemptionValue:e.target.value})} /></label>
        <label>Minimum redeem<input type="number" min="1" value={ruleForm.minRedeemPoints} onChange={(e)=>setRuleForm({...ruleForm,minRedeemPoints:e.target.value})} /></label>
        <label>Voucher expiry days<input type="number" min="1" value={ruleForm.expiryDays} onChange={(e)=>setRuleForm({...ruleForm,expiryDays:e.target.value})} placeholder="optional" /></label>
        <label className="check-label"><input type="checkbox" checked={ruleForm.isDefault} onChange={(e)=>setRuleForm({...ruleForm,isDefault:e.target.checked})} /> Make default</label>
        <button className="primary-btn" disabled={saving}>Save Rule</button>
      </form>
      <DataTable columns={[{key:'name',label:'Rule'},{key:'earn',label:'Earn',render:(r)=>`${r.earnPoints} per ${money(r.earnAmountStep)}`},{key:'redeem',label:'Redeem',render:(r)=>`${money(r.redemptionValue)} / point`},{key:'minRedeemPoints',label:'Min Redeem'},{key:'isDefault',label:'Default',render:(r)=><span className={`badge ${r.isDefault?'paid':'partial'}`}>{r.isDefault?'Default':'Optional'}</span>}]} rows={rules} empty="No rules found" />
    </div>}
  </div>;
}
