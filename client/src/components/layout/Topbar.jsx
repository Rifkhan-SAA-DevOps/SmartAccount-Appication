import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, LogOut, Search } from 'lucide-react';
import { useAuth } from '../../state/AuthContext.jsx';
import { api } from '../../api/http.js';

export default function Topbar() {
  const { user, tenant, logout } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadUnread() {
      try {
        const res = await api.get('/notifications/summary');
        if (active) setUnread(res.data?.unread || 0);
      } catch (_) {
        if (active) setUnread(0);
      }
    }
    loadUnread();
    const id = setInterval(loadUnread, 60000);
    return () => { active = false; clearInterval(id); };
  }, []);

  return (
    <header className="topbar">
      <div className="search-box"><Search size={18} /><input placeholder="Search invoices, customers, products..." /></div>
      <div className="top-actions">
        <span className="tenant-pill">{tenant?.name || 'Company'}</span>
        <Link to="/notifications" className="icon-btn notification-top-btn" title="Notifications">
          <Bell size={18} />
          {unread > 0 && <span className="notify-dot">{unread > 99 ? '99+' : unread}</span>}
        </Link>
        <div className="user-chip"><span>{user?.name?.slice(0,1)}</span><b>{user?.role}</b></div>
        <button className="logout-btn" onClick={logout}><LogOut size={18} /> Logout</button>
      </div>
    </header>
  );
}
