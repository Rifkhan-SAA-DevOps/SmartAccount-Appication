import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/App.jsx');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find src/App.jsx. Run this from the client folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');
const importLine = "import VanStock from './pages/VanStock.jsx';";
if (!app.includes(importLine)) {
  const markers = [
    "import ShopCollections from './pages/ShopCollections.jsx';",
    "import ShopSupply from './pages/ShopSupply.jsx';",
    "import Distribution from './pages/Distribution.jsx';",
    "import Branches from './pages/Branches.jsx';"
  ];
  const marker = markers.find((m) => app.includes(m));
  if (marker) app = app.replace(marker, `${marker}\n${importLine}`);
  else app = `${importLine}\n${app}`;
}

const routeLine = '<Route path="van-stock" element={<VanStock />} />';
if (!app.includes(routeLine)) {
  const markers = [
    '<Route path="shop-collections" element={<ShopCollections />} />',
    '<Route path="shop-supply" element={<ShopSupply />} />',
    '<Route path="distribution" element={<Distribution />} />',
    '<Route path="branches" element={<Branches />} />'
  ];
  const marker = markers.find((m) => app.includes(m));
  if (marker) app = app.replace(marker, `${marker}\n        ${routeLine}`);
  else app = app.replace('</Routes>', `        ${routeLine}\n      </Routes>`);
}
fs.writeFileSync(appPath, app);
console.log('Updated App.jsx with Van Stock route.');

const sidebarPath = path.resolve('src/components/layout/Sidebar.jsx');
if (fs.existsSync(sidebarPath)) {
  let sidebar = fs.readFileSync(sidebarPath, 'utf8');

  if (!sidebar.includes("to: '/van-stock'")) {
    const vanStockLink = "{ to: '/van-stock', label: 'Van Stock / Route Loading', note: 'Load vans and close route stock', icon: Truck }";
    const branchTransferLink = "{ to: '/branch-transfers', label: 'Branch Transfers', note: 'Move stock between locations', icon: ArrowLeftRight }";
    const distributionLink = "{ to: '/distribution', label: 'Distribution / Shop Supply', note: 'Routes, shops, reps and collections', icon: Truck }";
    if (sidebar.includes(branchTransferLink)) {
      sidebar = sidebar.replace(branchTransferLink, `${branchTransferLink},\n          ${vanStockLink}`);
    } else if (sidebar.includes(distributionLink)) {
      sidebar = sidebar.replace(distributionLink, `${distributionLink},\n          ${vanStockLink}`);
    } else {
      sidebar = sidebar.replace("{ to: '/branches', label: 'Branches / Warehouses'", `${vanStockLink},\n          { to: '/branches', label: 'Branches / Warehouses'`);
    }
  }

  if (sidebar.includes("{ id: 'inventory', paths:")) {
    sidebar = sidebar.replace(/\{ id: 'inventory', paths: \[([^\]]*)\]/, (match, paths) => {
      if (paths.includes("'/van-stock'")) return match;
      return `{ id: 'inventory', paths: [${paths}, '/van-stock']`;
    });
  }

  fs.writeFileSync(sidebarPath, sidebar);
  console.log('Updated Sidebar.jsx with Van Stock link.');
} else {
  console.warn('Sidebar.jsx not found. Add /van-stock link manually if needed.');
}
