import { NavLink } from 'react-router-dom';
import { BarChart3, Barcode, BookOpen, Boxes, Building2, Calculator, CreditCard, Home, Landmark, Package, Receipt, RotateCcw, Settings, FileText, ShoppingBag, ShoppingCart, Users, UserRoundCog, Warehouse, ShieldCheck, ClipboardCheck, Bell, ScrollText, Download, FileSpreadsheet, Factory, CalendarClock, Wrench, Handshake, FileSignature, KanbanSquare, CircleDollarSign, Archive, Coins, Gift, Truck, LineChart, Megaphone, LayoutDashboard } from 'lucide-react';

const items = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/pos', label: 'POS', icon: ShoppingCart },
  { to: '/invoices', label: 'Sales / Invoices', icon: Receipt },
  { to: '/products', label: 'Inventory', icon: Boxes },
  { to: '/barcode-labels', label: 'Barcode / QR Labels', icon: Barcode },
  { to: '/purchases', label: 'Purchases / GRN', icon: ShoppingBag },
  { to: '/returns', label: 'Returns', icon: RotateCcw },
  { to: '/approvals', label: 'Approvals', icon: ClipboardCheck },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { to: '/ledgers', label: 'Ledgers & Payments', icon: BookOpen },
  { to: '/cash-bank', label: 'Cash / Bank Book', icon: Landmark },
  { to: '/accounting', label: 'Accounting', icon: Calculator },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/suppliers', label: 'Suppliers', icon: Package },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/export-center', label: 'Export Center', icon: Download },
  { to: '/statements', label: 'Statements', icon: FileSpreadsheet },
  { to: '/cheques', label: 'Cheque Management', icon: CreditCard },
  { to: '/warranty', label: 'Warranty / IMEI', icon: ShieldCheck },
  { to: '/manufacturing', label: 'Manufacturing / Recipe', icon: Factory },
  { to: '/batches', label: 'Expiry / Batch Tracking', icon: CalendarClock },
  { to: '/service-jobs', label: 'Service Jobs', icon: Wrench },
  { to: '/crm', label: 'CRM / Leads', icon: Handshake },
  { to: '/projects', label: 'Projects / Tasks', icon: KanbanSquare },
  { to: '/installments', label: 'Installments / Hire Purchase', icon: CircleDollarSign },
  { to: '/bank-reconciliation', label: 'Bank Reconciliation', icon: Landmark },
  { to: '/fixed-assets', label: 'Fixed Assets', icon: Archive },
  { to: '/multi-currency', label: 'Multi-currency', icon: Coins },
  { to: '/loyalty', label: 'Loyalty / Rewards', icon: Gift },
  { to: '/deliveries', label: 'Delivery / Dispatch', icon: Truck },
  { to: '/budgeting', label: 'Budgeting / Forecasting', icon: LineChart },
  { to: '/campaigns', label: 'WhatsApp / Email Campaigns', icon: Megaphone },
  { to: '/dashboard-builder', label: 'Dashboard Builder', icon: LayoutDashboard },
  { to: '/quotations', label: 'Quotations / Sales Orders', icon: FileSignature },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/branches', label: 'Branches / Warehouses', icon: Warehouse },
  { to: '/users', label: 'Users & Roles', icon: UserRoundCog },
  { to: '/subscription', label: 'Subscription', icon: CreditCard },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/saas-admin', label: 'SaaS Owner', icon: ShieldCheck }
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">SL</div>
        <div>
          <strong>SmartLedger</strong>
          <span>Business ERP SaaS</span>
        </div>
      </div>
      <nav>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="side-card">
        <Building2 size={22} />
        <strong>Multi-tenant ready</strong>
        <span>Each company has isolated data, users, plans and reports.</span>
      </div>
    </aside>
  );
}
