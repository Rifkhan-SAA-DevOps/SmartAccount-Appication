import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/App.jsx');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find src/App.jsx. Run this from the client folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');
const importLine = "import TradeOffers from './pages/TradeOffers.jsx';";
if (!app.includes(importLine)) {
  const markers = [
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

const routeLine = '<Route path="trade-offers" element={<TradeOffers />} />';
if (!app.includes(routeLine)) {
  const markers = [
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
console.log('Updated App.jsx with Trade Offers route.');

const sidebarPath = path.resolve('src/components/layout/Sidebar.jsx');
if (fs.existsSync(sidebarPath)) {
  let sidebar = fs.readFileSync(sidebarPath, 'utf8');

  if (!sidebar.includes("to: '/trade-offers'")) {
    const link = "{ to: '/trade-offers', label: 'Trade Offers / Price Lists', note: 'Free item schemes and shop prices', icon: Gift }";
    const campaignLink = "{ to: '/campaigns', label: 'WhatsApp / Email Campaigns', note: 'Promotions and reminders', icon: Megaphone }";
    const shopReturnsLink = "{ to: '/shop-returns', label: 'Shop Returns / Damage', note: 'Damage, expiry and credit note returns', icon: RotateCcw }";
    const shopSupplyLink = "{ to: '/shop-supply', label: 'Shop Supply Invoices', note: 'Supply products to shops', icon: Truck }";
    if (sidebar.includes(campaignLink)) sidebar = sidebar.replace(campaignLink, `${campaignLink},\n          ${link}`);
    else if (sidebar.includes(shopReturnsLink)) sidebar = sidebar.replace(shopReturnsLink, `${shopReturnsLink},\n          ${link}`);
    else if (sidebar.includes(shopSupplyLink)) sidebar = sidebar.replace(shopSupplyLink, `${shopSupplyLink},\n          ${link}`);
  }

  if (sidebar.includes("{ id: 'sales', paths:")) {
    sidebar = sidebar.replace(/\{ id: 'sales', paths: \[([^\]]*)\]/, (match, paths) => {
      if (paths.includes("'/trade-offers'")) return match;
      return `{ id: 'sales', paths: [${paths}, '/trade-offers']`;
    });
  }

  fs.writeFileSync(sidebarPath, sidebar);
  console.log('Updated Sidebar.jsx with Trade Offers link.');
} else {
  console.warn('Sidebar.jsx not found. Add /trade-offers link manually if needed.');
}
