import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Archive,
  ArrowLeftRight,
  BarChart3,
  Barcode,
  Bell,
  BellRing,
  BookOpen,
  Bot,
  Boxes,
  Building2,
  CalendarClock,
  Calculator,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Coins,
  CreditCard,
  Download,
  Factory,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Gift,
  Handshake,
  Home,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  LineChart,
  LockKeyhole,
  Megaphone,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  RotateCcw,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Truck,
  UserRoundCog,
  Users,
  Warehouse,
  Wrench,
  X
} from 'lucide-react';

const menuGroups = [
  {
    id: 'new',
    title: 'New',
    icon: Plus,
    accent: 'purple',
    description: 'Quick create actions',
    sections: [
      {
        heading: 'Create faster',
        links: [
          { to: '/invoices', label: 'New Invoice', note: 'Create sales invoice', icon: Receipt },
          { to: '/customers', label: 'New Customer', note: 'Add customer profile', icon: Users },
          { to: '/purchases', label: 'New Purchase / GRN', note: 'Record stock purchase', icon: ShoppingBag },
          { to: '/expenses', label: 'New Expense', note: 'Use Cash / Bank Book if expense route is not separate', icon: CircleDollarSign, fallbackTo: '/cash-bank' },
          { to: '/quotations', label: 'New Quotation', note: 'Estimate before invoice', icon: FileSignature },
          { to: '/service-jobs', label: 'New Service Job', note: 'Repair / appointment job', icon: Wrench }
        ]
      }
    ]
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: Home,
    accent: 'violet',
    direct: '/',
    description: 'Business overview',
    sections: [
      {
        heading: 'Dashboard',
        links: [
          { to: '/', label: 'Main Dashboard', note: 'Daily overview', icon: Home },
          { to: '/dashboard-builder', label: 'Dashboard Builder', note: 'Customize widgets', icon: LayoutDashboard },
          { to: '/smart-assistant', label: 'Smart Assistant', note: 'Ask business questions', icon: Bot },
          { to: '/smart-alerts', label: 'Smart Alerts', note: 'Auto warnings', icon: BellRing }
        ]
      }
    ]
  },
  {
    id: 'people',
    title: 'People',
    icon: Users,
    accent: 'blue',
    description: 'Customers, suppliers and teams',
    sections: [
      {
        heading: 'Customers',
        links: [
          { to: '/customers', label: 'Customers', note: 'List and manage customers', icon: Users },
          { to: '/ledgers', label: 'Customer Ledger', note: 'Credit and payment history', icon: BookOpen },
          { to: '/returns', label: 'Customer Returns', note: 'Sales return records', icon: RotateCcw },
          { to: '/loyalty', label: 'Loyalty / Rewards', note: 'Points and reward tiers', icon: Gift },
          { to: '/installments', label: 'Installments', note: 'Hire purchase tracking', icon: CircleDollarSign }
        ]
      },
      {
        heading: 'Suppliers',
        links: [
          { to: '/suppliers', label: 'Suppliers', note: 'Supplier profiles', icon: Package },
          { to: '/ledgers', label: 'Supplier Ledger', note: 'Payables and payments', icon: BookOpen },
          { to: '/returns', label: 'Purchase Returns', note: 'Return stock to supplier', icon: RotateCcw }
        ]
      },
      {
        heading: 'Team / CRM',
        links: [
          { to: '/crm', label: 'CRM / Leads', note: 'Sales leads and follow-ups', icon: Handshake },
          { to: '/hr-payroll', label: 'HR / Payroll', note: 'Employees and attendance', icon: Users },
          { to: '/projects', label: 'Projects / Tasks', note: 'Work planning', icon: KanbanSquare }
        ]
      }
    ]
  },
  {
    id: 'sales',
    title: 'Sales',
    icon: Receipt,
    accent: 'pink',
    description: 'Sales workflow and billing',
    sections: [
      {
        heading: 'Sales documents',
        links: [
          { to: '/pos', label: 'POS', note: 'Fast counter billing', icon: ShoppingCart },
          { to: '/quotations', label: 'Quotations / Sales Orders', note: 'Estimate to order flow', icon: FileSignature },
          { to: '/invoices', label: 'Invoices', note: 'Sales invoices and payments', icon: Receipt },
          { to: '/deliveries', label: 'Delivery / Dispatch', note: 'Pack and deliver orders', icon: Truck },
          { to: '/returns', label: 'Sales Returns', note: 'Returned sold items', icon: RotateCcw }
        ]
      },
      {
        heading: 'Service sales',
        links: [
          { to: '/service-jobs', label: 'Service Jobs', note: 'Jobs, repair, appointments', icon: Wrench },
          { to: '/warranty', label: 'Warranty / IMEI', note: 'Serial and warranty claims', icon: ShieldCheck },
          { to: '/campaigns', label: 'WhatsApp / Email Campaigns', note: 'Promotions and follow-ups', icon: Megaphone }
        ]
      }
    ]
  },
  {
    id: 'inventory',
    title: 'Inventory',
    icon: Boxes,
    accent: 'green',
    description: 'Products, stock and purchasing',
    sections: [
      {
        heading: 'Product stock',
        links: [
          { to: '/products', label: 'Products', note: 'Items, price and stock', icon: Boxes },
          { to: '/batches', label: 'Batches / Expiry', note: 'Expiry and batch tracking', icon: CalendarClock },
          { to: '/barcode-labels', label: 'Barcode / QR Labels', note: 'Print labels', icon: Barcode },
          { to: '/branches', label: 'Branches / Warehouses', note: 'Locations and stock', icon: Warehouse },
          { to: '/branch-transfers', label: 'Branch Transfers', note: 'Move stock between branches', icon: ArrowLeftRight }
        ]
      },
      {
        heading: 'Purchasing',
        links: [
          { to: '/purchases', label: 'Purchases / GRN', note: 'Purchase orders and receiving', icon: ShoppingBag },
          { to: '/returns', label: 'Purchase Returns', note: 'Return goods to suppliers', icon: RotateCcw },
          { to: '/manufacturing', label: 'Manufacturing / Recipe', note: 'Assemble finished goods', icon: Factory }
        ]
      }
    ]
  },
  {
    id: 'finance',
    title: 'Finance',
    icon: Landmark,
    accent: 'amber',
    description: 'Bank, accounting and money flow',
    sections: [
      {
        heading: 'Money',
        links: [
          { to: '/cash-bank', label: 'Cash / Bank Book', note: 'Cash and bank accounts', icon: Landmark },
          { to: '/ledgers', label: 'Ledgers & Payments', note: 'Customer/supplier payments', icon: BookOpen },
          { to: '/cheques', label: 'Cheque Management', note: 'Issued and received cheques', icon: CreditCard },
          { to: '/bank-reconciliation', label: 'Bank Reconciliation', note: 'Match bank transactions', icon: Landmark }
        ]
      },
      {
        heading: 'Accounting',
        links: [
          { to: '/accounting', label: 'Accounting', note: 'Journal, P&L, balance sheet', icon: Calculator },
          { to: '/fixed-assets', label: 'Fixed Assets', note: 'Assets and depreciation', icon: Archive },
          { to: '/multi-currency', label: 'Multi-currency', note: 'Exchange rates', icon: Coins },
          { to: '/budgeting', label: 'Budgeting / Forecasting', note: 'Plan future cash flow', icon: LineChart }
        ]
      }
    ]
  },
  {
    id: 'analytics',
    title: 'Analytics',
    icon: BarChart3,
    accent: 'indigo',
    description: 'Reports and exports',
    sections: [
      {
        heading: 'Reports',
        links: [
          { to: '/reports', label: 'Reports', note: 'Basic and advanced reports', icon: BarChart3 },
          { to: '/statements', label: 'Statements', note: 'Customer/supplier statements', icon: FileSpreadsheet },
          { to: '/export-center', label: 'Export Center', note: 'Export reports and data', icon: Download },
          { to: '/dashboard-builder', label: 'Dashboard Builder', note: 'Build custom dashboard', icon: LayoutDashboard },
          { to: '/smart-assistant', label: 'Smart Assistant', note: 'Explain business data', icon: Bot },
          { to: '/smart-alerts', label: 'Smart Alerts', note: 'Automatic recommendations', icon: BellRing }
        ]
      }
    ]
  },
  {
    id: 'documents',
    title: 'Documents',
    icon: FileText,
    accent: 'slate',
    direct: '/documents',
    description: 'Attachment center',
    sections: [
      {
        heading: 'Files',
        links: [
          { to: '/documents', label: 'Document Attachment Center', note: 'Attach files to ERP records', icon: FileText },
          { to: '/export-center', label: 'Export Center', note: 'Export files and reports', icon: Download },
          { to: '/statements', label: 'Statements', note: 'Business statements', icon: FileSpreadsheet }
        ]
      }
    ]
  },
  {
    id: 'control',
    title: 'Control Center',
    icon: Settings,
    accent: 'red',
    description: 'Approvals, security and settings',
    sections: [
      {
        heading: 'Operations control',
        links: [
          { to: '/approvals', label: 'Approval Workflow', note: 'Approve important actions', icon: ClipboardCheck },
          { to: '/notifications', label: 'Notifications', note: 'Alerts and reminders', icon: Bell },
          { to: '/audit-logs', label: 'Audit Logs', note: 'Track user actions', icon: ScrollText },
          { to: '/security-center', label: 'Security Center', note: 'Login history and devices', icon: LockKeyhole }
        ]
      },
      {
        heading: 'Administration',
        links: [
          { to: '/users', label: 'Users & Roles', note: 'Team permissions', icon: UserRoundCog },
          { to: '/subscription', label: 'Subscription', note: 'Plan and limits', icon: CreditCard },
          { to: '/settings', label: 'Settings', note: 'Business settings', icon: Settings },
          { to: '/saas-admin', label: 'SaaS Owner', note: 'Platform owner console', icon: ShieldCheck }
        ]
      }
    ]
  }
];

function normalizeLink(link) {
  return { ...link, to: link.fallbackTo || link.to };
}

function groupHasActive(group, pathname) {
  if (group.direct === pathname) return true;
  return group.sections.some((section) =>
    section.links.some((rawLink) => {
      const link = normalizeLink(rawLink);
      return link.to === '/' ? pathname === '/' : pathname.startsWith(link.to);
    })
  );
}

function FlyoutContent({ group, onNavigate }) {
  return (
    <>
      <div className="flyout-header">
        <div>
          <span>{group.title}</span>
          <strong>{group.description}</strong>
        </div>
      </div>

      <div className="flyout-sections">
        {group.sections.map((section) => (
          <div className="flyout-section" key={section.heading}>
            <h4>{section.heading}</h4>
            <div className="flyout-link-list">
              {section.links.map((rawLink) => {
                const link = normalizeLink(rawLink);
                const Icon = link.icon;
                return (
                  <NavLink
                    key={`${section.heading}-${link.label}-${link.to}`}
                    to={link.to}
                    end={link.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) => `flyout-link ${isActive ? 'active' : ''}`}
                  >
                    <span className="flyout-link-icon"><Icon size={17} /></span>
                    <span className="flyout-link-copy">
                      <b>{link.label}</b>
                      <small>{link.note}</small>
                    </span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Sidebar({ isOpen = false, isCollapsed = false, onClose = () => {}, onToggleCollapse = () => {} }) {
  const location = useLocation();
  const closeTimerRef = useRef(null);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [flyoutTop, setFlyoutTop] = useState(104);
  const [flyoutLeft, setFlyoutLeft] = useState(isCollapsed ? 92 : 280);

  const activeGroup = menuGroups.find((group) => group.id === activeGroupId);

  useEffect(() => {
    function updateLeft() {
      const sidebar = document.querySelector('.smart-sidebar');
      const rect = sidebar?.getBoundingClientRect();
      setFlyoutLeft(Math.round((rect?.right || (isCollapsed ? 82 : 270)) + 10));
    }
    updateLeft();
    window.addEventListener('resize', updateLeft);
    return () => window.removeEventListener('resize', updateLeft);
  }, [isCollapsed, isOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  function cancelClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setActiveGroupId(null), 140);
  }

  function openFlyout(group, event) {
    cancelClose();
    setActiveGroupId(group.id);

    const row = event?.currentTarget;
    const rect = row?.getBoundingClientRect();
    const estimatedHeight = Math.min(window.innerHeight * 0.74, 620);
    const top = rect?.top || 96;
    const safeTop = Math.max(88, Math.min(top - 8, window.innerHeight - estimatedHeight - 18));
    setFlyoutTop(Math.round(safeTop));

    const sidebar = row?.closest('.smart-sidebar');
    const sidebarRect = sidebar?.getBoundingClientRect();
    setFlyoutLeft(Math.round((sidebarRect?.right || (isCollapsed ? 82 : 270)) + 10));
  }

  function handleMainClick(group, event) {
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (!group.direct || isMobile) {
      event.preventDefault();
    }

    if (isMobile) {
      setExpandedGroupId((current) => (current === group.id ? null : group.id));
      return;
    }

    if (!group.direct) {
      openFlyout(group, event);
    }
  }

  function handleNavigate() {
    setActiveGroupId(null);
    setExpandedGroupId(null);
    onClose();
  }

  return (
    <aside className={`sidebar smart-sidebar ${isOpen ? 'is-mobile-open' : ''} ${isCollapsed ? 'is-collapsed' : ''}`}>
      <div className="brand smart-brand">
        <Link to="/" className="smart-brand-link" onClick={handleNavigate} title="SmartLedger">
          <div className="brand-mark smart-brand-mark">SL</div>
          <div className="smart-brand-copy">
            <strong>SmartLedger</strong>
            <span>Business ERP SaaS</span>
          </div>
        </Link>
        <div className="sidebar-brand-actions">
          <button className="sidebar-collapse-btn" onClick={onToggleCollapse} aria-label={isCollapsed ? 'Open sidebar' : 'Close sidebar'} title={isCollapsed ? 'Open sidebar' : 'Close sidebar'}>
            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close sidebar">
            <X size={18} />
          </button>
        </div>
      </div>

      <nav className="sidebar-main-nav" aria-label="Main navigation">
        {menuGroups.map((group) => {
          const Icon = group.icon;
          const isActive = groupHasActive(group, location.pathname);
          const isExpanded = expandedGroupId === group.id;
          const directTo = group.direct || group.sections[0]?.links[0]?.to || '/';
          return (
            <div
              key={group.id}
              className={`sidebar-menu-row ${isActive ? 'active' : ''} ${isExpanded ? 'is-expanded' : ''} accent-${group.accent}`}
              onMouseEnter={(event) => openFlyout(group, event)}
              onMouseLeave={scheduleClose}
              onFocus={(event) => openFlyout(group, event)}
            >
              <NavLink
                to={directTo}
                end={directTo === '/'}
                className="sidebar-menu-button"
                onClick={(event) => handleMainClick(group, event)}
                title={isCollapsed ? group.title : undefined}
              >
                <span className="sidebar-menu-icon"><Icon size={20} /></span>
                <span className="sidebar-menu-text">{group.title}</span>
                <ChevronRight className="sidebar-menu-chevron" size={17} />
              </NavLink>

              <div className={`mobile-inline-flyout accent-${group.accent}`}>
                <FlyoutContent group={group} onNavigate={handleNavigate} />
              </div>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer-card">
        <div className="sidebar-footer-top">
          <Building2 size={18} />
          <strong>Multi-tenant ERP</strong>
        </div>
        <span>Sales, inventory, finance, reports and control modules in one workspace.</span>
      </div>

      {activeGroup && (
        <div
          className={`sidebar-flyout desktop-flyout accent-${activeGroup.accent}`}
          style={{ top: flyoutTop, left: flyoutLeft }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <FlyoutContent group={activeGroup} onNavigate={handleNavigate} />
        </div>
      )}
    </aside>
  );
}
