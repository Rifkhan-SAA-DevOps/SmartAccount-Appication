import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/App.jsx');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find src/App.jsx. Run this from the client folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');
const importLine = "import ShopSupply from './pages/ShopSupply.jsx';";
if (!app.includes(importLine)) {
  const marker = "import Distribution from './pages/Distribution.jsx';";
  if (app.includes(marker)) app = app.replace(marker, `${marker}\n${importLine}`);
  else app = app.replace("import DashboardBuilder from './pages/DashboardBuilder.jsx';", "import DashboardBuilder from './pages/DashboardBuilder.jsx';\n" + importLine);
}

const routeLine = '<Route path="shop-supply" element={<ShopSupply />} />';
if (!app.includes(routeLine)) {
  const distributionRoute = '<Route path="distribution" element={<Distribution />} />';
  if (app.includes(distributionRoute)) app = app.replace(distributionRoute, `${distributionRoute}\n        ${routeLine}`);
  else app = app.replace('<Route path="deliveries" element={<Deliveries />} />', `<Route path="deliveries" element={<Deliveries />} />\n        ${routeLine}`);
}
fs.writeFileSync(appPath, app);
console.log('Updated App.jsx with Shop Supply route.');

const sidebarPath = path.resolve('src/components/layout/Sidebar.jsx');
if (fs.existsSync(sidebarPath)) {
  let sidebar = fs.readFileSync(sidebarPath, 'utf8');
  if (!sidebar.includes("to: '/shop-supply'")) {
    const shopSupplyLink = "{ to: '/shop-supply', label: 'Shop Supply Invoice', note: 'Wholesale supply billing for shops', icon: Truck }";
    const distributionLink = "{ to: '/distribution', label: 'Distribution / Shop Supply', note: 'Routes, shops, reps and collections', icon: Truck }";
    if (sidebar.includes(distributionLink)) {
      sidebar = sidebar.replace(distributionLink, `${distributionLink},\n          ${shopSupplyLink}`);
    } else {
      const deliveryLink = "{ to: '/deliveries', label: 'Delivery / Dispatch', note: 'Pack, dispatch and deliver', icon: Truck }";
      sidebar = sidebar.replace(deliveryLink, `${deliveryLink},\n          ${shopSupplyLink}`);
    }
  }

  if (sidebar.includes("{ id: 'sales', paths:")) {
    sidebar = sidebar.replace(/\{ id: 'sales', paths: \[([^\]]*)\]/, (match, paths) => {
      if (paths.includes("'/shop-supply'")) return match;
      return `{ id: 'sales', paths: [${paths}, '/shop-supply']`;
    });
  }

  fs.writeFileSync(sidebarPath, sidebar);
  console.log('Updated Sidebar.jsx with Shop Supply Invoice link.');
} else {
  console.warn('Sidebar.jsx not found. Add /shop-supply link manually if needed.');
}
