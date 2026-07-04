import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/AuthContext.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import Login from './pages/Login.jsx';
import RegisterCompany from './pages/RegisterCompany.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import Suppliers from './pages/Suppliers.jsx';
import Products from './pages/Products.jsx';
import Invoices from './pages/Invoices.jsx';
import Purchases from './pages/Purchases.jsx';
import Returns from './pages/Returns.jsx';
import Ledgers from './pages/Ledgers.jsx';
import CashBank from './pages/CashBank.jsx';
import Accounting from './pages/Accounting.jsx';
import POS from './pages/POS.jsx';
import Reports from './pages/Reports.jsx';
import Users from './pages/Users.jsx';
import Subscription from './pages/Subscription.jsx';
import Settings from './pages/Settings.jsx';
import Documents from './pages/Documents.jsx';
import Branches from './pages/Branches.jsx';
import BarcodeLabels from './pages/BarcodeLabels.jsx';
import SaasAdmin from './pages/SaasAdmin.jsx';
import Approvals from './pages/Approvals.jsx';
import Notifications from './pages/Notifications.jsx';
import AuditLogs from './pages/AuditLogs.jsx';
import ExportCenter from './pages/ExportCenter.jsx';
import Statements from './pages/Statements.jsx';
import Cheques from './pages/Cheques.jsx';
import Warranty from './pages/Warranty.jsx';
import Manufacturing from './pages/Manufacturing.jsx';
import Batches from './pages/Batches.jsx';
import ServiceJobs from './pages/ServiceJobs.jsx';
import CRM from './pages/CRM.jsx';
import Quotations from './pages/Quotations.jsx';
import HRPayroll from './pages/HRPayroll.jsx';
import ProjectsTasks from './pages/ProjectsTasks.jsx';
import Installments from './pages/Installments.jsx';
import BankReconciliation from './pages/BankReconciliation.jsx';
import FixedAssets from './pages/FixedAssets.jsx';
import MultiCurrency from './pages/MultiCurrency.jsx';
import Loyalty from './pages/Loyalty.jsx';
import Deliveries from './pages/Deliveries.jsx';
import BudgetingForecasting from './pages/BudgetingForecasting.jsx';
import Campaigns from './pages/Campaigns.jsx';
import DashboardBuilder from './pages/DashboardBuilder.jsx';
import BranchTransfers from './pages/BranchTransfers.jsx';
import SecurityCenter from './pages/SecurityCenter.jsx';

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading SmartLedger...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<RegisterCompany />} />
      <Route path="/saas-admin" element={<SaasAdmin />} />
      <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="products" element={<Products />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="returns" element={<Returns />} />
        <Route path="ledgers" element={<Ledgers />} />
        <Route path="cash-bank" element={<CashBank />} />
        <Route path="accounting" element={<Accounting />} />
        <Route path="pos" element={<POS />} />
        <Route path="reports" element={<Reports />} />
        <Route path="export-center" element={<ExportCenter />} />
        <Route path="statements" element={<Statements />} />
        <Route path="cheques" element={<Cheques />} />
        <Route path="warranty" element={<Warranty />} />
        <Route path="manufacturing" element={<Manufacturing />} />
        <Route path="batches" element={<Batches />} />
        <Route path="service-jobs" element={<ServiceJobs />} />
        <Route path="crm" element={<CRM />} />
        <Route path="quotations" element={<Quotations />} />
        <Route path="hr-payroll" element={<HRPayroll />} />
        <Route path="projects" element={<ProjectsTasks />} />
        <Route path="installments" element={<Installments />} />
        <Route path="bank-reconciliation" element={<BankReconciliation />} />
        <Route path="fixed-assets" element={<FixedAssets />} />
        <Route path="multi-currency" element={<MultiCurrency />} />
        <Route path="loyalty" element={<Loyalty />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="budgeting" element={<BudgetingForecasting />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="dashboard-builder" element={<DashboardBuilder />} />
        <Route path="users" element={<Users />} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="settings" element={<Settings />} />
        <Route path="documents" element={<Documents />} />
        <Route path="branches" element={<Branches />} />
        <Route path="branch-transfers" element={<BranchTransfers />} />
        <Route path="security-center" element={<SecurityCenter />} />
        <Route path="barcode-labels" element={<BarcodeLabels />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="audit-logs" element={<AuditLogs />} />
      </Route>
    </Routes>
  );
}
