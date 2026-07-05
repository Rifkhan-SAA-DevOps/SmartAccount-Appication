import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/app.js');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find src/app.js. Run this from the server folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');
const importLine = "import distributorDashboardRoutes from './routes/distributorDashboard.routes.js';";
if (!app.includes(importLine)) {
  const markers = [
    "import distributorReportsRoutes from './routes/distributorReports.routes.js';",
    "import tradeOffersRoutes from './routes/tradeOffers.routes.js';",
    "import shopReturnsRoutes from './routes/shopReturns.routes.js';",
    "import vanStockRoutes from './routes/vanStock.routes.js';",
    "import shopCollectionsRoutes from './routes/shopCollections.routes.js';",
    "import shopSupplyRoutes from './routes/shopSupply.routes.js';",
    "import distributionRoutes from './routes/distribution.routes.js';"
  ];
  const marker = markers.find((m) => app.includes(m));
  if (marker) app = app.replace(marker, `${marker}\n${importLine}`);
  else app = `${importLine}\n${app}`;
}

const useLine = "app.use('/api/distributor-dashboard', distributorDashboardRoutes);";
if (!app.includes(useLine)) {
  const markers = [
    "app.use('/api/distributor-reports', distributorReportsRoutes);",
    "app.use('/api/trade-offers', tradeOffersRoutes);",
    "app.use('/api/shop-returns', shopReturnsRoutes);",
    "app.use('/api/van-stock', vanStockRoutes);",
    "app.use('/api/shop-collections', shopCollectionsRoutes);",
    "app.use('/api/shop-supply', shopSupplyRoutes);",
    "app.use('/api/distribution', distributionRoutes);"
  ];
  const marker = markers.find((m) => app.includes(m));
  if (marker) app = app.replace(marker, `${marker}\n${useLine}`);
  else app += `\n${useLine}\n`;
}

fs.writeFileSync(appPath, app);
console.log('Registered /api/distributor-dashboard route in src/app.js');
