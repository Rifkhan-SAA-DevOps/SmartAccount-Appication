import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/App.jsx');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find src/App.jsx. Run this from the client folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');
const importLine = "import RepMobile from './pages/RepMobile.jsx';";
if (!app.includes(importLine)) {
  const markers = [
    "import DistributorDashboard from './pages/DistributorDashboard.jsx';",
    "import DistributorReports from './pages/DistributorReports.jsx';",
    "import TradeOffers from './pages/TradeOffers.jsx';",
    "import ShopReturns from './pages/ShopReturns.jsx';",
    "import VanStock from './pages/VanStock.jsx';",
    "import ShopCollections from './pages/ShopCollections.jsx';",
    "import ShopSupply from './pages/ShopSupply.jsx';",
    "import Distribution from './pages/Distribution.jsx';"
  ];
  const marker = markers.find((m) => app.includes(m));
  if (marker) app = app.replace(marker, `${marker}\n${importLine}`);
  else app = `${importLine}\n${app}`;
}

const routeLine = '<Route path="rep-mobile" element={<RepMobile />} />';
if (!app.includes(routeLine)) {
  const markers = [
    '<Route path="distributor-dashboard" element={<DistributorDashboard />} />',
    '<Route path="distributor-reports" element={<DistributorReports />} />',
    '<Route path="trade-offers" element={<TradeOffers />} />',
    '<Route path="shop-returns" element={<ShopReturns />} />',
    '<Route path="van-stock" element={<VanStock />} />',
    '<Route path="shop-collections" element={<ShopCollections />} />',
    '<Route path="shop-supply" element={<ShopSupply />} />',
    '<Route path="distribution" element={<Distribution />} />'
  ];
  const marker = markers.find((m) => app.includes(m));
  if (marker) app = app.replace(marker, `${marker}\n        ${routeLine}`);
  else app += `\n        ${routeLine}\n`;
}

fs.writeFileSync(appPath, app);
console.log('Updated App.jsx with Rep Mobile route.');

const sidebarPath = path.resolve('src/components/layout/Sidebar.jsx');
if (fs.existsSync(sidebarPath)) {
  let sidebar = fs.readFileSync(sidebarPath, 'utf8');

  const hasTruckImport = sidebar.includes('Truck,');
  if (!hasTruckImport && sidebar.includes("from 'lucide-react'")) {
    sidebar = sidebar.replace(/(\n\s*Store,?)/, `$1\n  Truck,`);
  }

  if (!sidebar.includes("to: '/rep-mobile'")) {
    const link = "{ to: '/rep-mobile', label: 'Sales Rep Mobile Mode', note: 'Phone-friendly route visits, collections and supply', icon: Truck }";
    const dashboardLink = "{ to: '/distributor-dashboard', label: 'Distributor Dashboard', note: 'Today route sales, collections and owner closing', icon: LayoutDashboard }";
    const reportsLink = "{ to: '/distributor-reports', label: 'Distributor Reports', note: 'Routes, shops, collections and van reports', icon: FileSpreadsheet }";
    const distributionLink = "{ to: '/distribution', label: 'Distribution / Shop Supply', note: 'Routes, shops, reps and collections', icon: Truck }";
    const shopSupplyLink = "{ to: '/shop-supply', label: 'Shop Supply Invoices', note: 'Supply products to shops', icon: Truck }";

    if (sidebar.includes(distributionLink)) sidebar = sidebar.replace(distributionLink, `${distributionLink},\n          ${link}`);
    else if (sidebar.includes(shopSupplyLink)) sidebar = sidebar.replace(shopSupplyLink, `${shopSupplyLink},\n          ${link}`);
    else if (sidebar.includes(dashboardLink)) sidebar = sidebar.replace(dashboardLink, `${dashboardLink},\n          ${link}`);
    else if (sidebar.includes(reportsLink)) sidebar = sidebar.replace(reportsLink, `${link},\n          ${reportsLink}`);
  }

  sidebar = sidebar.replace(/\{ id: 'sales', paths: \[([^\]]*)\]/, (match, paths) => {
    if (paths.includes("'/rep-mobile'")) return match;
    return `{ id: 'sales', paths: [${paths}, '/rep-mobile']`;
  });
  sidebar = sidebar.replace(/\{ id: 'dashboard', paths: \[([^\]]*)\]/, (match, paths) => {
    if (paths.includes("'/rep-mobile'")) return match;
    return `{ id: 'dashboard', paths: [${paths}, '/rep-mobile']`;
  });

  fs.writeFileSync(sidebarPath, sidebar);
  console.log('Updated Sidebar.jsx with Sales Rep Mobile Mode link.');
} else {
  console.warn('Sidebar.jsx not found. Add /rep-mobile manually if needed.');
}
