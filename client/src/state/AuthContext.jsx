import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile() {
    const token = localStorage.getItem('smartledger_token');
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      setTenant(data.tenant);
    } catch {
      localStorage.removeItem('smartledger_token');
      setUser(null);
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProfile(); }, []);

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('smartledger_token', data.token);
    setUser(data.user);
    setTenant(data.tenant);
    return data;
  }

  async function registerCompany(payload) {
    const { data } = await api.post('/auth/register-company', payload);
    localStorage.setItem('smartledger_token', data.token);
    setUser(data.user);
    setTenant(data.tenant);
    return data;
  }

  function logout() {
    localStorage.removeItem('smartledger_token');
    setUser(null);
    setTenant(null);
  }

  const value = useMemo(() => ({ user, tenant, loading, login, logout, registerCompany, isAuthenticated: Boolean(user) }), [user, tenant, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
