import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronDown, Globe2, LogOut, Menu, Search, ShoppingCart } from 'lucide-react';
import { useAuth } from '../../state/AuthContext.jsx';
import { api } from '../../api/http.js';

export default function Topbar({ onMenuClick }) {
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
    <header className="topbar smart-topbar">
      <div className="topbar-left">
        <button className="mobile-menu-btn" onClick={onMenuClick} aria-label="Open sidebar">
          <Menu size={20} />
        </button>
        <button className="branch-switcher" type="button">
          <span className="branch-icon">▦</span>
          <span>{tenant?.name || 'Main Branch'}</span>
          <ChevronDown size={16} />
        </button>
      </div>

      <div className="search-box smart-search-box">
        <Search size={18} />
        <input placeholder="Search invoices, customers, products..." />
      </div>

      <div className="top-actions smart-top-actions">
        <Link to="/subscription" className="upgrade-pill">Upgrade</Link>
        <Link to="/pos" className="pos-pill"><ShoppingCart size={17} /> POS</Link>
        <button className="language-pill" type="button"><Globe2 size={18} /><span>English</span><ChevronDown size={14} /></button>
        <Link to="/notifications" className="icon-btn notification-top-btn" title="Notifications">
          <Bell size={18} />
          {unread > 0 && <span className="notify-dot">{unread > 99 ? '99+' : unread}</span>}
        </Link>
        <div className="user-chip smart-user-chip">
          <span>{user?.name?.slice(0, 1)?.toUpperCase() || 'U'}</span>
          <b>{user?.name || user?.role || 'User'}</b>
        </div>
        <button className="logout-btn smart-logout-btn" onClick={logout}><LogOut size={18} /> Logout</button>
      </div>
    </header>
  );
}
