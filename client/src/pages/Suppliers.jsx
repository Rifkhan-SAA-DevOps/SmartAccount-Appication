import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

export default function Suppliers() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  async function load() { const { data } = await api.get('/suppliers'); setRows(data); }
  useEffect(() => { load(); }, []);
  function update(e) { setForm({ ...form, [e.target.name]: e.target.value }); }
  async function submit(e) { e.preventDefault(); await api.post('/suppliers', form); setForm({ name: '', phone: '', email: '' }); load(); }
  return (
    <div className="page two-col-page">
      <section className="panel"><h1>Suppliers</h1><DataTable columns={[{key:'name',label:'Name'},{key:'phone',label:'Phone'},{key:'balance',label:'Balance',render:(r)=>`LKR ${r.balance}`}]} rows={rows} /></section>
      <section className="panel"><h2>Add Supplier</h2><form onSubmit={submit} className="form-grid">
        <label>Name<input name="name" value={form.name} onChange={update} required /></label><label>Phone<input name="phone" value={form.phone} onChange={update} /></label><label>Email<input name="email" value={form.email} onChange={update} /></label><button className="primary-btn">Save Supplier</button>
      </form></section>
    </div>
  );
}
