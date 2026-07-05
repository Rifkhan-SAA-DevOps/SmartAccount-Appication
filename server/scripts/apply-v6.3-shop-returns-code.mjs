import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/app.js');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find src/app.js. Run this from the server folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');
const importLine = "import shopReturnsRoutes from './routes/shopReturns.routes.js';";
if (!app.includes(importLine)) {
  const markers = [
    "import vanStockRoutes from './routes/vanStock.routes.js';",
    "import shopCollectionsRoutes from './routes/shopCollections.routes.js';",
    "import shopSupplyRoutes from './routes/shopSupply.routes.js';",
    "import distributionRoutes from './routes/distribution.routes.js';",
    "import returnRoutes from './routes/returns.routes.js';"
  ];
  const marker = markers.find((m) => app.includes(m));
  if (marker) app = app.replace(marker, `${marker}\n${importLine}`);
  else app = `${importLine}\n${app}`;
}

const useLine = "app.use('/api/shop-returns', shopReturnsRoutes);";
if (!app.includes(useLine)) {
  const markers = [
    "app.use('/api/van-stock', vanStockRoutes);",
    "app.use('/api/shop-collections', shopCollectionsRoutes);",
    "app.use('/api/shop-supply', shopSupplyRoutes);",
    "app.use('/api/distribution', distributionRoutes);",
    "app.use('/api/returns', returnRoutes);"
  ];
  const marker = markers.find((m) => app.includes(m));
  if (marker) app = app.replace(marker, `${marker}\n${useLine}`);
  else app += `\n${useLine}\n`;
}

fs.writeFileSync(appPath, app);
console.log('Registered /api/shop-returns route in src/app.js');
