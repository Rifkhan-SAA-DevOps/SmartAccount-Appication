import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'owner@demo.com', password: 'Demo@12345' });
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try { await login(form.email, form.password); navigate('/'); }
    catch (err) { setError(err.response?.data?.message || 'Login failed'); }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand big"><div className="brand-mark">SL</div><div><strong>SmartLedger</strong><span>Accounting + Inventory + POS SaaS</span></div></div>
        <h1>Welcome back</h1>
        <p>Login to manage sales, products, customers, reports and subscriptions.</p>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={submit} className="form-grid">
          <label>Email<input value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} /></label>
          <label>Password<input type="password" value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} /></label>
          <button className="primary-btn">Login</button>
        </form>
        <p className="center-text">New business? <Link to="/register">Create company account</Link></p>
      </div>
    </div>
  );
}
