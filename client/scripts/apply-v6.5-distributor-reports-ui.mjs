import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/App.jsx');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find src/App.jsx. Run this from the client folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');
const importLine = "import DistributorReports from './pages/DistributorReports.jsx';";
if (!app.includes(importLine)) {
  const markers = [
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

const routeLine = '<Route path="distributor-reports" element={<DistributorReports />} />';
if (!app.includes(routeLine)) {
  const markers = [
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
console.log('Updated App.jsx with Distributor Reports route.');

const sidebarPath = path.resolve('src/components/layout/Sidebar.jsx');
if (fs.existsSync(sidebarPath)) {
  let sidebar = fs.readFileSync(sidebarPath, 'utf8');

  if (!sidebar.includes("to: '/distributor-reports'")) {
    const link = "{ to: '/distributor-reports', label: 'Distributor Reports', note: 'Routes, shops, collections and van reports', icon: FileSpreadsheet }";
    const exportLink = "{ to: '/export-center', label: 'Export Center', note: 'Download reports and data', icon: Download }";
    const reportsLink = "{ to: '/reports', label: 'Customer Reports', note: 'Customer sales and balances', icon: FileText }";
    const distributionLink = "{ to: '/distribution', label: 'Distribution / Shop Supply', note: 'Routes, shops, reps and collections', icon: Truck }";
    if (sidebar.includes(exportLink)) sidebar = sidebar.replace(exportLink, `${exportLink},\n          ${link}`);
    else if (sidebar.includes(reportsLink)) sidebar = sidebar.replace(reportsLink, `${reportsLink},\n          ${link}`);
    else if (sidebar.includes(distributionLink)) sidebar = sidebar.replace(distributionLink, `${distributionLink},\n          ${link}`);
  }

  if (sidebar.includes("{ id: 'analytics', paths:")) {
    sidebar = sidebar.replace(/\{ id: 'analytics', paths: \[([^\]]*)\]/, (match, paths) => {
      if (paths.includes("'/distributor-reports'")) return match;
      return `{ id: 'analytics', paths: [${paths}, '/distributor-reports']`;
    });
  }

  fs.writeFileSync(sidebarPath, sidebar);
  console.log('Updated Sidebar.jsx with Distributor Reports link.');
} else {
  console.warn('Sidebar.jsx not found. Add /distributor-reports manually if needed.');
}
