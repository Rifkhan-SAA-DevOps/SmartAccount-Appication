import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/App.jsx');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find src/App.jsx. Run this from the client folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');
const importLine = "import DistributorDashboard from './pages/DistributorDashboard.jsx';";
if (!app.includes(importLine)) {
  const markers = [
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

const routeLine = '<Route path="distributor-dashboard" element={<DistributorDashboard />} />';
if (!app.includes(routeLine)) {
  const markers = [
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
console.log('Updated App.jsx with Distributor Dashboard route.');

const sidebarPath = path.resolve('src/components/layout/Sidebar.jsx');
if (fs.existsSync(sidebarPath)) {
  let sidebar = fs.readFileSync(sidebarPath, 'utf8');

  if (!sidebar.includes("to: '/distributor-dashboard'")) {
    const link = "{ to: '/distributor-dashboard', label: 'Distributor Dashboard', note: 'Today route sales, collections and owner closing', icon: LayoutDashboard }";
    const dashboardBuilderLink = "{ to: '/dashboard-builder', label: 'Dashboard Builder', note: 'Customize dashboard widgets', icon: LayoutDashboard }";
    const distributorReportsLink = "{ to: '/distributor-reports', label: 'Distributor Reports', note: 'Routes, shops, collections and van reports', icon: FileSpreadsheet }";
    const distributionLink = "{ to: '/distribution', label: 'Distribution / Shop Supply', note: 'Routes, shops, reps and collections', icon: Truck }";
    if (sidebar.includes(dashboardBuilderLink)) sidebar = sidebar.replace(dashboardBuilderLink, `${dashboardBuilderLink},\n          ${link}`);
    else if (sidebar.includes(distributorReportsLink)) sidebar = sidebar.replace(distributorReportsLink, `${link},\n          ${distributorReportsLink}`);
    else if (sidebar.includes(distributionLink)) sidebar = sidebar.replace(distributionLink, `${distributionLink},\n          ${link}`);
  }

  if (sidebar.includes("{ id: 'dashboard', paths:")) {
    sidebar = sidebar.replace(/\{ id: 'dashboard', paths: \[([^\]]*)\]/, (match, paths) => {
      if (paths.includes("'/distributor-dashboard'")) return match;
      return `{ id: 'dashboard', paths: [${paths}, '/distributor-dashboard']`;
    });
  }

  fs.writeFileSync(sidebarPath, sidebar);
  console.log('Updated Sidebar.jsx with Distributor Dashboard link.');
} else {
  console.warn('Sidebar.jsx not found. Add /distributor-dashboard manually if needed.');
}
