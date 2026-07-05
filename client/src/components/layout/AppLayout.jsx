import { useCallback, useEffect, useMemo, useState } from 'react';
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

  const [isMobileNav, setIsMobileNav] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 900px)').matches;
  });

  useEffect(() => {
    try {
      localStorage.setItem('smartledger-sidebar-collapsed', String(sidebarCollapsed));
    } catch (_) {
      // ignore localStorage errors
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const media = window.matchMedia('(max-width: 900px)');
    const updateMode = () => setIsMobileNav(media.matches);
    updateMode();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', updateMode);
      return () => media.removeEventListener('change', updateMode);
    }

    media.addListener(updateMode);
    return () => media.removeListener(updateMode);
  }, []);

  const [navFocus, setNavFocus] = useState(false);

  const mobileDrawerOpen = useMemo(() => isMobileNav && sidebarOpen, [isMobileNav, sidebarOpen]);

  useEffect(() => {
    // Very important:
    // The hamburger drawer must exist only on mobile/tablet width.
    // When the screen returns to desktop, clear the drawer state so the app
    // never shows a backdrop or a second-looking sidebar on large screens.
    if (!isMobileNav && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [isMobileNav, sidebarOpen]);

  useEffect(() => {
    if (mobileDrawerOpen) {
      setNavFocus(false);
    }
  }, [mobileDrawerOpen]);

  const handleNavFocusChange = useCallback((value) => {
    // The desktop hover/flyout focus effect must never run while the mobile
    // drawer is open. Otherwise the page can look double-blurred.
    if (mobileDrawerOpen) {
      setNavFocus(false);
      return;
    }
    setNavFocus(Boolean(value));
  }, [mobileDrawerOpen]);

  const handleMenuClick = useCallback(() => {
    if (isMobileNav) {
      setNavFocus(false);
      setSidebarOpen(true);
      return;
    }

    // Safety fallback: if the button is visible because of cached CSS or a
    // breakpoint edge case, do not open a mobile drawer on desktop.
    setSidebarCollapsed(false);
  }, [isMobileNav]);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
    setNavFocus(false);
  }, []);

  return (
    <div className={`app-shell smart-app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${navFocus ? 'nav-focus-active' : ''} ${mobileDrawerOpen ? 'mobile-drawer-active' : ''}`}>
      <Sidebar
        isOpen={mobileDrawerOpen}
        isCollapsed={sidebarCollapsed}
        onClose={handleCloseSidebar}
        onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
        onFocusChange={handleNavFocusChange}
      />

      {mobileDrawerOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={handleCloseSidebar}
        />
      )}

      <main className="main-shell smart-main-shell">
        <div className="smart-nav-focus-overlay" aria-hidden="true" />
        <Topbar onMenuClick={handleMenuClick} />
        <section className="page-wrap smart-page-wrap">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
