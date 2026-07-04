import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', email: '', creditLimit: 0 });
  const [error, setError] = useState('');

  async function load() { const { data } = await api.get('/customers'); setRows(data); }
  useEffect(() => { load().catch((e)=>setError(e.response?.data?.message || 'Failed')); }, []);
  function update(e) { setForm({ ...form, [e.target.name]: e.target.value }); }
  async function submit(e) { e.preventDefault(); await api.post('/customers', form); setForm({ name: '', phone: '', email: '', creditLimit: 0 }); load(); }

  return (
    <div className="page two-col-page">
      <section className="panel"><h1>Customers</h1>{error && <div className="error-box">{error}</div>}<DataTable columns={[
        { key:'name', label:'Name' }, { key:'phone', label:'Phone' }, { key:'balance', label:'Balance', render:(r)=>`LKR ${r.balance}` }, { key:'creditLimit', label:'Credit Limit', render:(r)=>`LKR ${r.creditLimit}` }
      ]} rows={rows} /></section>
      <section className="panel"><h2>Add Customer</h2><form onSubmit={submit} className="form-grid">
        <label>Name<input name="name" value={form.name} onChange={update} required /></label>
        <label>Phone<input name="phone" value={form.phone} onChange={update} /></label>
        <label>Email<input name="email" value={form.email} onChange={update} /></label>
        <label>Credit Limit<input name="creditLimit" type="number" value={form.creditLimit} onChange={update} /></label>
        <button className="primary-btn">Save Customer</button>
      </form></section>
    </div>
  );
}
