import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

export default function Users() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CASHIER' });
  const [error, setError] = useState('');
  async function load(){ const {data}=await api.get('/users'); setRows(data); }
  useEffect(()=>{ load().catch(e=>setError(e.response?.data?.message || 'Failed')); },[]);
  function update(e){ setForm({...form,[e.target.name]:e.target.value}); }
  async function submit(e){ e.preventDefault(); setError(''); try{ await api.post('/users', form); setForm({ name:'', email:'', password:'', role:'CASHIER' }); load(); }catch(e){setError(e.response?.data?.message || 'Failed to create user');}}
  return <div className="page two-col-page"><section className="panel"><h1>Users & Roles</h1>{error && <div className="error-box">{error}</div>}<DataTable columns={[{key:'name',label:'Name'},{key:'email',label:'Email'},{key:'role',label:'Role'},{key:'isActive',label:'Status',render:r=>r.isActive?'Active':'Disabled'}]} rows={rows}/></section><section className="panel"><h2>Add User</h2><form onSubmit={submit} className="form-grid"><label>Name<input name="name" value={form.name} onChange={update}/></label><label>Email<input name="email" value={form.email} onChange={update}/></label><label>Password<input name="password" type="password" value={form.password} onChange={update}/></label><label>Role<select name="role" value={form.role} onChange={update}><option>CASHIER</option><option>ADMIN</option><option>ACCOUNTANT</option><option>INVENTORY_MANAGER</option><option>SALES_STAFF</option><option>VIEWER</option><option>AUDITOR</option></select></label><button className="primary-btn">Create User</button></form></section></div>;
}
