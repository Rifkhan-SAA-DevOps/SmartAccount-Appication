import fs from 'fs';
import path from 'path';

const sidebarPath = path.resolve('src/components/layout/Sidebar.jsx');
if (!fs.existsSync(sidebarPath)) {
  console.error('Cannot find src/components/layout/Sidebar.jsx. Run this from the client folder.');
  process.exit(1);
}

let text = fs.readFileSync(sidebarPath, 'utf8');
if (text.includes("to: '/distribution'")) {
  console.log('Distribution link already exists in Sidebar.jsx');
  process.exit(0);
}

const deliveryLink = "{ to: '/deliveries', label: 'Delivery / Dispatch', note: 'Pack, dispatch and deliver', icon: Truck }";
const distributionLink = "{ to: '/distribution', label: 'Distribution / Shop Supply', note: 'Routes, shops, reps and collections', icon: Truck }";
if (text.includes(deliveryLink)) {
  text = text.replace(deliveryLink, `${deliveryLink},\n          ${distributionLink}`);
} else {
  const salesNeedle = "{ to: '/invoices', label: 'Invoices'";
  const idx = text.indexOf(salesNeedle);
  if (idx !== -1) {
    const endLine = text.indexOf('\n', idx);
    text = `${text.slice(0, endLine + 1)}          ${distributionLink},\n${text.slice(endLine + 1)}`;
  } else {
    console.warn('Could not find Sales links area. Please add /distribution manually.');
  }
}

const salesPaths = "{ id: 'sales', paths: ['/pos', '/quotations', '/invoices', '/deliveries'";
if (text.includes(salesPaths)) {
  text = text.replace("'/deliveries'", "'/deliveries', '/distribution'");
} else if (text.includes("id: 'sales'") && !text.includes("'/distribution'")) {
  console.warn('Could not update primaryPathGroups automatically. Add /distribution to the sales group manually if needed.');
}

fs.writeFileSync(sidebarPath, text);
console.log('Updated Sidebar.jsx with Distribution / Shop Supply link.');
