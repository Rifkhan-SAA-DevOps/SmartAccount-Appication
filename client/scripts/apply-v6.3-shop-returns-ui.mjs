import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/App.jsx');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find src/App.jsx. Run this from the client folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');
const importLine = "import ShopReturns from './pages/ShopReturns.jsx';";
if (!app.includes(importLine)) {
  const markers = [
    "import VanStock from './pages/VanStock.jsx';",
    "import ShopCollections from './pages/ShopCollections.jsx';",
    "import ShopSupply from './pages/ShopSupply.jsx';",
    "import Distribution from './pages/Distribution.jsx';",
    "import Returns from './pages/Returns.jsx';"
  ];
  const marker = markers.find((m) => app.includes(m));
  if (marker) app = app.replace(marker, `${marker}\n${importLine}`);
  else app = app.replace("import Returns from './pages/Returns.jsx';", "import Returns from './pages/Returns.jsx';\n" + importLine);
}

const routeLine = '<Route path="shop-returns" element={<ShopReturns />} />';
if (!app.includes(routeLine)) {
  const markers = [
    '<Route path="van-stock" element={<VanStock />} />',
    '<Route path="shop-collections" element={<ShopCollections />} />',
    '<Route path="shop-supply" element={<ShopSupply />} />',
    '<Route path="distribution" element={<Distribution />} />',
    '<Route path="returns" element={<Returns />} />'
  ];
  const marker = markers.find((m) => app.includes(m));
  if (marker) app = app.replace(marker, `${marker}\n        ${routeLine}`);
  else app = app.replace('<Route path="returns" element={<Returns />} />', `<Route path="returns" element={<Returns />} />\n        ${routeLine}`);
}
fs.writeFileSync(appPath, app);
console.log('Updated App.jsx with Shop Returns route.');

const sidebarPath = path.resolve('src/components/layout/Sidebar.jsx');
if (fs.existsSync(sidebarPath)) {
  let sidebar = fs.readFileSync(sidebarPath, 'utf8');
  if (!sidebar.includes("to: '/shop-returns'")) {
    const link = "{ to: '/shop-returns', label: 'Shop Returns / Damage', note: 'Damage, expiry and credit note returns', icon: RotateCcw }";
    const shopCollectionsLink = "{ to: '/shop-collections', label: 'Shop Collections', note: 'Collect shop payments and recover outstanding', icon: CircleDollarSign }";
    const distributionLink = "{ to: '/distribution', label: 'Distribution / Shop Supply', note: 'Routes, shops, reps and collections', icon: Truck }";
    const returnsLink = "{ to: '/returns', label: 'Customer Returns', note: 'Sales return records', icon: RotateCcw }";
    if (sidebar.includes(shopCollectionsLink)) sidebar = sidebar.replace(shopCollectionsLink, `${shopCollectionsLink},\n          ${link}`);
    else if (sidebar.includes(distributionLink)) sidebar = sidebar.replace(distributionLink, `${distributionLink},\n          ${link}`);
    else if (sidebar.includes(returnsLink)) sidebar = sidebar.replace(returnsLink, `${returnsLink},\n          ${link}`);
  }

  if (sidebar.includes("{ id: 'sales', paths:")) {
    sidebar = sidebar.replace(/\{ id: 'sales', paths: \[([^\]]*)\]/, (match, paths) => {
      if (paths.includes("'/shop-returns'")) return match;
      return `{ id: 'sales', paths: [${paths}, '/shop-returns']`;
    });
  }

  fs.writeFileSync(sidebarPath, sidebar);
  console.log('Updated Sidebar.jsx with Shop Returns link.');
} else {
  console.warn('Sidebar.jsx not found. Add /shop-returns link manually if needed.');
}
