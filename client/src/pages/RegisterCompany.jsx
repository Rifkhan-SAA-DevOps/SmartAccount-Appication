import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';

export default function RegisterCompany() {
  const { registerCompany } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ companyName: '', businessType: 'shop', ownerName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');

  function update(e) { setForm({ ...form, [e.target.name]: e.target.value }); }
  async function submit(e) {
    e.preventDefault(); setError('');
    try { await registerCompany(form); navigate('/'); }
    catch (err) { setError(err.response?.data?.message || 'Registration failed'); }
  }

  return (
    <div className="auth-page">
      <div className="auth-card wide">
        <div className="brand big"><div className="brand-mark">SL</div><div><strong>Create SmartLedger Company</strong><span>Start 14-day trial</span></div></div>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={submit} className="form-grid two">
          <label>Company Name<input name="companyName" value={form.companyName} onChange={update} required /></label>
          <label>Business Type<select name="businessType" value={form.businessType} onChange={update}><option value="shop">Shop</option><option value="company">Company</option><option value="service">Service Business</option><option value="personal">Personal/Freelancer</option></select></label>
          <label>Owner Name<input name="ownerName" value={form.ownerName} onChange={update} required /></label>
          <label>Phone<input name="phone" value={form.phone} onChange={update} /></label>
          <label>Email<input name="email" type="email" value={form.email} onChange={update} required /></label>
          <label>Password<input name="password" type="password" value={form.password} onChange={update} required /></label>
          <button className="primary-btn span-two">Create Company</button>
        </form>
        <p className="center-text">Already have account? <Link to="/login">Login</Link></p>
      </div>
    </div>
  );
}
