import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('smartledger-sidebar-collapsed') === 'true';
    } catch (_) {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('smartledger-sidebar-collapsed', String(sidebarCollapsed));
    } catch (_) {
      // ignore localStorage errors
    }
  }, [sidebarCollapsed]);

  return (
    <div className={`app-shell smart-app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={sidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
      />
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}

      <main className="main-shell smart-main-shell">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <section className="page-wrap smart-page-wrap">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
