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
    isQuick: true,
    description: 'Quick create actions',
    sections: [
      {
        heading: 'Create new record',
        links: [
          { to: '/invoices', label: 'New Invoice', note: 'Create a sales invoice', icon: Receipt },
          { to: '/shop-supply', label: 'New Shop Supply', note: 'Supply products to shops', icon: Truck },
          { to: '/shop-collections', label: 'Record Shop Collection', note: 'Collect money from shops', icon: CircleDollarSign },
          { to: '/customers', label: 'Add Customer', note: 'Create customer profile', icon: Users },
          { to: '/suppliers', label: 'Add Supplier', note: 'Create supplier profile', icon: Package },
          { to: '/products', label: 'Add Product', note: 'Create inventory item', icon: Boxes },
          { to: '/purchases', label: 'Add Purchase / GRN', note: 'Buy and receive stock', icon: ShoppingBag },
          { to: '/cash-bank', label: 'Record Expense', note: 'Add money-out transaction', icon: CircleDollarSign },
          { to: '/quotations', label: 'Add Quotation', note: 'Prepare estimate', icon: FileSignature },
          { to: '/service-jobs', label: 'Add Service Job', note: 'Create repair/service job', icon: Wrench }
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
    description: 'Business overview and smart workspace',
    sections: [
      {
        heading: 'Overview',
        links: [
          { to: '/', label: 'Main Dashboard', note: 'Today summary and quick actions', icon: Home },
          { to: '/dashboard-builder', label: 'Dashboard Builder', note: 'Customize dashboard widgets', icon: LayoutDashboard },
          { to: '/smart-assistant', label: 'Smart Assistant', note: 'Ask business questions', icon: Bot },
          { to: '/smart-alerts', label: 'Smart Alerts', note: 'Automatic warnings and suggestions', icon: BellRing }
        ]
      }
    ]
  },
  {
    id: 'people',
    title: 'People',
    icon: Users,
    accent: 'blue',
    description: 'Customers, suppliers, staff and leads',
    sections: [
      {
        heading: 'Customers',
        links: [
          { to: '/customers', label: 'Customers', note: 'Profiles, credit limits and balances', icon: Users },
          { to: '/ledgers', label: 'Customer / Supplier Ledgers', note: 'Receivables, payables and payments', icon: BookOpen },
          { to: '/installments', label: 'Installments / Hire Purchase', note: 'Schedules and installment payments', icon: CircleDollarSign },
          { to: '/loyalty', label: 'Loyalty / Rewards', note: 'Points, tiers and vouchers', icon: Gift }
        ]
      },
      {
        heading: 'Supplier Management',
        links: [
          { to: '/suppliers', label: 'Suppliers', note: 'Supplier profiles and payable balances', icon: Package },
          { to: '/purchases', label: 'Purchase Orders / GRN', note: 'Buy stock, receive goods and increase supplier payable', icon: ShoppingBag },
          { to: '/returns', label: 'Purchase Returns', note: 'Return damaged/expired stock back to supplier', icon: RotateCcw },
          { to: '/ledgers', label: 'Supplier Ledger / Payments', note: 'View payable history and record supplier payments', icon: BookOpen },
          { to: '/statements', label: 'Supplier Statements', note: 'Generate supplier account statements', icon: ScrollText },
          { to: '/reports?type=suppliers-outstanding', label: 'Supplier Outstanding Report', note: 'Check unpaid supplier balances', icon: FileText },
          { to: '/cheques', label: 'Supplier Cheques', note: 'Track post-dated/paid supplier cheques', icon: CreditCard }
        ]
      },
      {
        heading: 'Team / CRM',
        links: [
          { to: '/crm', label: 'CRM / Leads', note: 'Follow-ups and opportunities', icon: Handshake },
          { to: '/hr-payroll', label: 'Employees / HR', note: 'Staff, attendance and payroll', icon: Users }
        ]
      }
    ]
  },
  {
    id: 'sales',
    title: 'Sales',
    icon: Receipt,
    accent: 'pink',
    description: 'POS, quotations, invoices, delivery and sales follow-up',
    sections: [
      {
        heading: 'Billing',
        links: [
          { to: '/pos', label: 'POS', note: 'Fast counter billing', icon: ShoppingCart },
          { to: '/quotations', label: 'Quotations / Estimates', note: 'Quote before invoice', icon: FileSignature },
          { to: '/invoices', label: 'Invoices', note: 'Create and manage invoices', icon: Receipt },
          { to: '/deliveries', label: 'Delivery / Dispatch', note: 'Pack, dispatch and deliver', icon: Truck }
        ]
      },
      {
        heading: 'After-sales',
        links: [
          { to: '/returns', label: 'Sales / Purchase Returns', note: 'Return and credit note records', icon: RotateCcw },
          { to: '/warranty', label: 'Warranty / IMEI', note: 'Serial and warranty claims', icon: ShieldCheck },
          { to: '/campaigns', label: 'WhatsApp / Email Campaigns', note: 'Promotions and reminders', icon: Megaphone }
        ]
      }
    ]
  },
  {
    id: 'distribution',
    title: 'Distribution',
    icon: Truck,
    accent: 'cyan',
    description: 'Shop supply, routes, reps, vans, collections and field sales',
    sections: [
      {
        heading: 'Overview / Field work',
        links: [
          { to: '/distributor-dashboard', label: 'Distributor Dashboard', note: 'Owner daily route and collection view', icon: LayoutDashboard },
          { to: '/distribution', label: 'Shops / Routes / Vans', note: 'Manage outlets, routes, reps and vehicles', icon: Truck },
          { to: '/rep-mobile', label: 'Rep Mobile Mode', note: 'Mobile screen for route sales reps', icon: Users },
          { to: '/rep-offline', label: 'Rep Offline / PWA', note: 'Offline drafts and sync for field work', icon: Bell }
        ]
      },
      {
        heading: 'Shop operations',
        links: [
          { to: '/shop-supply', label: 'Shop Supply Invoice', note: 'Supply products to shops and update outstanding', icon: Receipt },
          { to: '/shop-collections', label: 'Shop Collections', note: 'Collect money and recover outstanding', icon: CircleDollarSign },
          { to: '/van-stock', label: 'Van Stock / Route Loading', note: 'Load, sell, return and close van stock', icon: Warehouse },
          { to: '/shop-returns', label: 'Shop Returns', note: 'Damage, expiry and unsold returns', icon: RotateCcw }
        ]
      },
      {
        heading: 'Pricing / Reports',
        links: [
          { to: '/trade-offers', label: 'Trade Offers / Price Lists', note: 'Free items, bulk discounts and shop prices', icon: Gift },
          { to: '/distributor-reports', label: 'Distributor Reports', note: 'Route, rep, shop, collection and van reports', icon: BarChart3 }
        ]
      }
    ]
  },
  {
    id: 'inventory',
    title: 'Inventory',
    icon: Boxes,
    accent: 'green',
    description: 'Products, purchasing, batches, warehouses and production',
    sections: [
      {
        heading: 'Products / Stock',
        links: [
          { to: '/products', label: 'Products', note: 'Items, SKU, price and stock', icon: Boxes },
          { to: '/batches', label: 'Batches / Expiry', note: 'Batch and expiry tracking', icon: CalendarClock },
          { to: '/barcode-labels', label: 'Barcode / QR Labels', note: 'Print product labels', icon: Barcode },
          { to: '/branches', label: 'Branches / Warehouses', note: 'Locations and stock holding', icon: Warehouse },
          { to: '/branch-transfers', label: 'Branch Transfers', note: 'Move stock between locations', icon: ArrowLeftRight }
        ]
      },
      {
        heading: 'Purchasing / Production',
        links: [
          { to: '/purchases', label: 'Purchase Orders / GRN', note: 'Buy stock and receive goods', icon: ShoppingBag },
          { to: '/manufacturing', label: 'Manufacturing / Recipe', note: 'Raw materials to finished goods', icon: Factory },
          { to: '/approvals', label: 'Store Approvals', note: 'Approve stock operations', icon: ClipboardCheck }
        ]
      }
    ]
  },
  {
    id: 'finance',
    title: 'Finance',
    icon: Landmark,
    accent: 'amber',
    description: 'Cash, bank, accounting, assets and financial planning',
    sections: [
      {
        heading: 'Cash / Bank',
        links: [
          { to: '/cash-bank', label: 'Cash / Bank Book', note: 'Accounts and transactions', icon: Landmark },
          { to: '/bank-reconciliation', label: 'Bank Reconciliation', note: 'Match system and bank records', icon: Landmark },
          { to: '/cheques', label: 'Cheque Management', note: 'Cheque status and due dates', icon: CreditCard },
          { to: '/multi-currency', label: 'Multi-currency', note: 'Exchange rates and revaluation', icon: Coins }
        ]
      },
      {
        heading: 'Accounting / Planning',
        links: [
          { to: '/accounting', label: 'Accounting Ledger', note: 'Journal, trial balance, P&L and balance sheet', icon: Calculator },
          { to: '/fixed-assets', label: 'Fixed Assets', note: 'Assets and depreciation', icon: Archive },
          { to: '/budgeting', label: 'Budgeting / Forecasting', note: 'Plan future cash flow', icon: LineChart }
        ]
      }
    ]
  },
  {
    id: 'reports',
    title: 'Reports',
    icon: BarChart3,
    accent: 'indigo',
    description: 'Business reports, statements and exports',
    sections: [
      {
        heading: 'Business reports',
        links: [
          { to: '/reports', label: 'Stock Report', note: 'Product and stock analysis', icon: FileText },
          { to: '/reports', label: 'Invoice Detail Report', note: 'Invoice item and customer details', icon: FileText },
          { to: '/reports', label: 'Supplier Report', note: 'Supplier purchase/payable view', icon: FileText },
          { to: '/reports', label: 'Customer Reports', note: 'Customer sales and balances', icon: FileText },
          { to: '/reports', label: 'Warehouse Stock Report', note: 'Stock by warehouse/branch', icon: FileSpreadsheet },
          { to: '/reports', label: 'Outstanding Report', note: 'Unpaid and overdue invoices', icon: FileSpreadsheet }
        ]
      },
      {
        heading: 'Statements / Export',
        links: [
          { to: '/statements', label: 'Statements', note: 'Customer and supplier statements', icon: FileSpreadsheet },
          { to: '/export-center', label: 'Export Center', note: 'Download reports and data', icon: Download }
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
    description: 'Files and attachments linked to ERP records',
    sections: [
      {
        heading: 'Document center',
        links: [
          { to: '/documents', label: 'Document Attachment Center', note: 'Attach files to invoices, expenses and records', icon: FileText }
        ]
      }
    ]
  },
  {
    id: 'work',
    title: 'Work & Service',
    icon: CalendarClock,
    accent: 'cyan',
    description: 'Service jobs, appointments, projects and reminders',
    sections: [
      {
        heading: 'Work planning',
        links: [
          { to: '/service-jobs', label: 'Service Jobs / Appointments', note: 'Jobs, repairs and appointment work', icon: CalendarClock },
          { to: '/projects', label: 'Projects / Tasks', note: 'Planned work and deadlines', icon: KanbanSquare },
          { to: '/notifications', label: 'Reminders', note: 'Appointment and due reminders', icon: Bell }
        ]
      }
    ]
  },
  {
    id: 'control',
    title: 'Control Center',
    icon: Settings,
    accent: 'red',
    description: 'Approvals, security, users, settings and SaaS control',
    sections: [
      {
        heading: 'Workflow / Security',
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

const primaryPathGroups = [
  { id: 'dashboard', paths: ['/', '/dashboard-builder', '/smart-assistant', '/smart-alerts'] },
  { id: 'people', paths: ['/customers', '/suppliers', '/ledgers', '/loyalty', '/installments', '/crm', '/hr-payroll'] },
  { id: 'sales', paths: ['/pos', '/quotations', '/invoices', '/deliveries', '/warranty', '/campaigns', '/returns'] },
  { id: 'distribution', paths: ['/distributor-dashboard', '/distribution', '/shop-supply', '/shop-collections', '/van-stock', '/shop-returns', '/trade-offers', '/distributor-reports', '/rep-mobile', '/rep-offline'] },
  { id: 'inventory', paths: ['/products', '/batches', '/barcode-labels', '/branches', '/branch-transfers', '/purchases', '/manufacturing'] },
  { id: 'finance', paths: ['/cash-bank', '/bank-reconciliation', '/cheques', '/accounting', '/fixed-assets', '/multi-currency', '/budgeting'] },
  { id: 'reports', paths: ['/reports', '/statements', '/export-center'] },
  { id: 'documents', paths: ['/documents'] },
  { id: 'work', paths: ['/service-jobs', '/projects'] },
  { id: 'control', paths: ['/approvals', '/notifications', '/audit-logs', '/security-center', '/users', '/subscription', '/settings', '/saas-admin'] }
];

function normalizeLink(link) {
  return { ...link, to: link.fallbackTo || link.to };
}

function pathMatches(pathname, to) {
  if (!to) return false;
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

function getPrimaryActiveGroupId(pathname) {
  const sortedGroups = primaryPathGroups.map((group) => ({
    ...group,
    paths: [...group.paths].sort((a, b) => b.length - a.length)
  }));

  const match = sortedGroups.find((group) =>
    group.paths.some((path) => pathMatches(pathname, path))
  );

  if (match) return match.id;

  // Fallback only for future routes. Quick-action groups are never active.
  const fallbackGroup = menuGroups.find((group) => {
    if (group.isQuick) return false;
    if (pathMatches(pathname, group.direct)) return true;
    return group.sections.some((section) =>
      section.links.some((rawLink) => pathMatches(pathname, normalizeLink(rawLink).to))
    );
  });

  return fallbackGroup?.id || null;
}

function groupHasActive(group, pathname) {
  if (group.isQuick) return false;
  return getPrimaryActiveGroupId(pathname) === group.id;
}

function FlyoutContent({ group, onNavigate }) {
  const getDefaultOpenSections = (targetGroup) => {
    const sections = targetGroup.sections || [];
    return sections.reduce((openMap, section, index) => {
      // Open only the first submenu group by default.
      // Users can then open more sections at the same time manually.
      openMap[section.heading] = index === 0;
      return openMap;
    }, {});
  };

  const [openSections, setOpenSections] = useState(() => getDefaultOpenSections(group));

  useEffect(() => {
    // When hovering a new main menu, show the first section immediately,
    // but keep the remaining sections closed for a cleaner flyout.
    setOpenSections(getDefaultOpenSections(group));
  }, [group.id]);

  function toggleSection(sectionHeading) {
    setOpenSections((current) => ({
      ...current,
      [sectionHeading]: !current[sectionHeading]
    }));
  }

  return (
    <>
      <div className="flyout-header">
        <div>
          <span>{group.title}</span>
          <strong>{group.description}</strong>
        </div>
      </div>

      <div className="flyout-sections">
        {group.sections.map((section) => {
          const isOpen = Boolean(openSections[section.heading]);
          return (
            <div className={`flyout-section ${isOpen ? 'is-open' : ''}`} key={section.heading}>
              <button
                type="button"
                className="flyout-section-toggle"
                onClick={() => toggleSection(section.heading)}
                aria-expanded={isOpen}
              >
                <span>{section.heading}</span>
                <ChevronRight className="flyout-section-chevron" size={16} />
              </button>

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
          );
        })}
      </div>
    </>
  );
}

export default function Sidebar({ isOpen = false, isCollapsed = false, onClose = () => {}, onToggleCollapse = () => {}, onFocusChange = () => {} }) {
  const location = useLocation();
  const closeTimerRef = useRef(null);
  const flyoutRef = useRef(null);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [flyoutAnchor, setFlyoutAnchor] = useState(null);
  const [flyoutTop, setFlyoutTop] = useState(104);
  const [flyoutLeft, setFlyoutLeft] = useState(isCollapsed ? 88 : 276);
  const [flyoutPointerTop, setFlyoutPointerTop] = useState('24px');
  const [flyoutMaxHeight, setFlyoutMaxHeight] = useState(620);
  const [flyoutAnchorMode, setFlyoutAnchorMode] = useState('top');
  const [isFlyoutReady, setIsFlyoutReady] = useState(false);

  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 901px)').matches;
  });

  const activeGroup = menuGroups.find((group) => group.id === activeGroupId);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(min-width: 901px)');
    const updateDesktopState = () => setIsDesktop(media.matches);
    updateDesktopState();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', updateDesktopState);
      return () => media.removeEventListener('change', updateDesktopState);
    }
    media.addListener(updateDesktopState);
    return () => media.removeListener(updateDesktopState);
  }, []);


  useEffect(() => {
    if (!isOpen) return;
    setActiveGroupId(null);
    setFlyoutAnchor(null);
    setIsFlyoutReady(false);
    onFocusChange(false);
  }, [isOpen, onFocusChange]);

  useEffect(() => {
    const isDesktop = !window.matchMedia('(max-width: 900px)').matches;
    onFocusChange(Boolean(activeGroupId) && isDesktop && !isOpen);
    return () => onFocusChange(false);
  }, [activeGroupId, isDesktop, isOpen, onFocusChange]);

  useEffect(() => {
    function updateLeftAndPosition() {
      const sidebar = document.querySelector('.smart-sidebar');
      const rect = sidebar?.getBoundingClientRect();
      setFlyoutLeft(Math.round((rect?.right || (isCollapsed ? 82 : 270)) + 6));
      if (flyoutAnchor && activeGroup) {
        applyAnchoredFlyoutPosition(flyoutAnchor, activeGroup);
      }
    }
    updateLeftAndPosition();
    window.addEventListener('resize', updateLeftAndPosition);
    return () => window.removeEventListener('resize', updateLeftAndPosition);
  }, [isCollapsed, isOpen, flyoutAnchor, activeGroupId]);

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

  function estimateFlyoutHeight(group) {
    const sections = group.sections || [];
    const sectionCount = Math.max(1, sections.length || 1);
    const headerHeight = 78;
    const panelPadding = 28;
    const sectionToggleHeight = 50;
    const sectionGap = Math.max(0, sectionCount - 1) * 10;
    // All submenu sections are opened by default, so estimate with all links visible.
    const totalLinks = sections.reduce((count, section) => count + (section.links?.length || 0), 0);
    const openLinksHeight = totalLinks ? 14 + (totalLinks * 48) : 0;
    return Math.min(720, headerHeight + panelPadding + (sectionCount * sectionToggleHeight) + sectionGap + openLinksHeight);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function applyAnchoredFlyoutPosition(anchor, group) {
    if (!anchor) return;

    const viewportHeight = window.innerHeight || 720;
    const margin = 14;
    const rowHeight = Math.max(42, anchor.rowHeight || 48);
    const rowTop = Math.round(anchor.rowTop || 96);
    const rowBottom = Math.round(anchor.rowBottom || (rowTop + rowHeight));
    const rowCenter = Math.round(anchor.rowCenter || (rowTop + rowHeight / 2));
    const estimatedHeight = estimateFlyoutHeight(group);
    const availableBelow = Math.max(260, viewportHeight - rowTop - margin);
    const availableAbove = Math.max(260, rowBottom - margin);

    // Stable anchor rule:
    // - top-half menu rows: flyout TOP aligns with menu row TOP.
    // - bottom-half menu rows: flyout BOTTOM aligns with menu row BOTTOM.
    // The parent row never moves, and dropdown open/close will not recalculate the
    // panel position. The flyout simply scrolls internally if it is too tall.
    const shouldBottomAnchor = rowCenter > viewportHeight * 0.54 || (
      estimatedHeight > availableBelow && availableAbove > availableBelow
    );

    if (shouldBottomAnchor) {
      setFlyoutAnchorMode('bottom');
      setFlyoutTop(clamp(rowBottom, margin + 260, viewportHeight - margin));
      setFlyoutMaxHeight(Math.max(260, Math.min(availableAbove, viewportHeight - (margin * 2))));
      setFlyoutPointerTop(`calc(100% - ${Math.round(rowHeight / 2)}px)`);
      return;
    }

    setFlyoutAnchorMode('top');
    setFlyoutTop(clamp(rowTop, margin, viewportHeight - margin - 260));
    setFlyoutMaxHeight(Math.max(260, Math.min(availableBelow, viewportHeight - (margin * 2))));
    setFlyoutPointerTop(`${Math.round(rowHeight / 2)}px`);
  }

  function openFlyout(group, event) {
    cancelClose();
    if (!isDesktop || isOpen) return;

    const row = event?.currentTarget;
    const rect = row?.getBoundingClientRect();
    const rowHeight = rect?.height || 48;
    const rowTop = rect?.top ?? 96;
    const rowBottom = rect?.bottom ?? (rowTop + rowHeight);
    const rowCenter = rowTop + (rowHeight / 2);
    const anchor = { rowTop, rowBottom, rowCenter, rowHeight };
    const isSwitchingGroup = activeGroupId !== group.id;

    if (isSwitchingGroup) {
      setIsFlyoutReady(false);
    }

    setActiveGroupId(group.id);
    setFlyoutAnchor(anchor);

    const sidebar = row?.closest('.smart-sidebar');
    const sidebarRect = sidebar?.getBoundingClientRect();
    setFlyoutLeft(Math.round((sidebarRect?.right || (isCollapsed ? 82 : 270)) + 6));

    // Position using a stable top/bottom anchor before showing the flyout.
    // No measured-height loop = no hover shake.
    applyAnchoredFlyoutPosition(anchor, group);
    requestAnimationFrame(() => setIsFlyoutReady(true));
  }

  function handleMainClick(group, event) {
    const isMobile = !isDesktop;
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
    onFocusChange(false);
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

      <div className="sidebar-nav-shell" aria-hidden="false">
        <div className="sidebar-scroll-cue sidebar-scroll-cue-top" aria-hidden="true" />
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
        <div className="sidebar-scroll-cue sidebar-scroll-cue-bottom" aria-hidden="true" />
      </div>

      <div className="sidebar-footer-card">
        <div className="sidebar-footer-top">
          <Building2 size={18} />
          <strong>Multi-tenant ERP</strong>
        </div>
        <span>Sales, distribution, inventory, finance and control modules in one workspace.</span>
      </div>

      {activeGroup && isDesktop && !isOpen && (
        <div
          ref={flyoutRef}
          className={`sidebar-flyout desktop-flyout accent-${activeGroup.accent} is-${flyoutAnchorMode}-anchored ${isFlyoutReady ? 'is-position-ready' : 'is-positioning'}`}
          style={{
            top: flyoutTop,
            left: flyoutLeft,
            maxHeight: flyoutMaxHeight,
            '--flyout-pointer-top': flyoutPointerTop,
            '--flyout-max-height': `${flyoutMaxHeight}px`
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <FlyoutContent group={activeGroup} onNavigate={handleNavigate} />
        </div>
      )}
    </aside>
  );
}
