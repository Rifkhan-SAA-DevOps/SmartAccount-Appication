import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/App.jsx');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find src/App.jsx. Run this from the client folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');
const importLine = "import ShopCollections from './pages/ShopCollections.jsx';";
if (!app.includes(importLine)) {
  const marker = "import ShopSupply from './pages/ShopSupply.jsx';";
  if (app.includes(marker)) app = app.replace(marker, `${marker}\n${importLine}`);
  else app = app.replace("import Deliveries from './pages/Deliveries.jsx';", "import Deliveries from './pages/Deliveries.jsx';\n" + importLine);
}

const routeLine = '<Route path="shop-collections" element={<ShopCollections />} />';
if (!app.includes(routeLine)) {
  const shopSupplyRoute = '<Route path="shop-supply" element={<ShopSupply />} />';
  if (app.includes(shopSupplyRoute)) app = app.replace(shopSupplyRoute, `${shopSupplyRoute}\n        ${routeLine}`);
  else app = app.replace('<Route path="deliveries" element={<Deliveries />} />', `<Route path="deliveries" element={<Deliveries />} />\n        ${routeLine}`);
}
fs.writeFileSync(appPath, app);
console.log('Updated App.jsx with Shop Collections route.');

const sidebarPath = path.resolve('src/components/layout/Sidebar.jsx');
if (fs.existsSync(sidebarPath)) {
  let sidebar = fs.readFileSync(sidebarPath, 'utf8');
  if (!sidebar.includes("to: '/shop-collections'")) {
    const link = "{ to: '/shop-collections', label: 'Shop Collections', note: 'Collect shop payments and recover outstanding', icon: CircleDollarSign }";
    const dueLink = "{ to: '/ledgers', label: 'Due Payments', note: 'Customer outstanding balances', icon: CircleDollarSign }";
    if (sidebar.includes(dueLink)) {
      sidebar = sidebar.replace(dueLink, `${dueLink},\n          ${link}`);
    } else {
      const distributionLink = "{ to: '/distribution', label: 'Distribution / Shop Supply', note: 'Routes, shops, reps and collections', icon: Truck }";
      sidebar = sidebar.replace(distributionLink, `${distributionLink},\n          ${link}`);
    }
  }

  if (sidebar.includes("{ id: 'sales', paths:")) {
    sidebar = sidebar.replace(/\{ id: 'sales', paths: \[([^\]]*)\]/, (match, paths) => {
      if (paths.includes("'/shop-collections'")) return match;
      return `{ id: 'sales', paths: [${paths}, '/shop-collections']`;
    });
  }

  fs.writeFileSync(sidebarPath, sidebar);
  console.log('Updated Sidebar.jsx with Shop Collections link.');
} else {
  console.warn('Sidebar.jsx not found. Add /shop-collections link manually if needed.');
}
