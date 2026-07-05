import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/app.js');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find src/app.js. Run this from the server folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');
const importLine = "import shopCollectionsRoutes from './routes/shopCollections.routes.js';";
if (!app.includes(importLine)) {
  const afterShopSupply = "import shopSupplyRoutes from './routes/shopSupply.routes.js';";
  const afterDistribution = "import distributionRoutes from './routes/distribution.routes.js';";
  if (app.includes(afterShopSupply)) app = app.replace(afterShopSupply, `${afterShopSupply}\n${importLine}`);
  else if (app.includes(afterDistribution)) app = app.replace(afterDistribution, `${afterDistribution}\n${importLine}`);
  else app = app.replace("import dashboardBuilderRoutes from './routes/dashboardBuilder.routes.js';", "import dashboardBuilderRoutes from './routes/dashboardBuilder.routes.js';\n" + importLine);
}

const useLine = "app.use('/api/shop-collections', shopCollectionsRoutes);";
if (!app.includes(useLine)) {
  const afterShopSupplyUse = "app.use('/api/shop-supply', shopSupplyRoutes);";
  const afterDistributionUse = "app.use('/api/distribution', distributionRoutes);";
  if (app.includes(afterShopSupplyUse)) app = app.replace(afterShopSupplyUse, `${afterShopSupplyUse}\n${useLine}`);
  else if (app.includes(afterDistributionUse)) app = app.replace(afterDistributionUse, `${afterDistributionUse}\n${useLine}`);
  else app = app.replace("app.use('/api/dashboard-builder', dashboardBuilderRoutes);", "app.use('/api/dashboard-builder', dashboardBuilderRoutes);\n" + useLine);
}

fs.writeFileSync(appPath, app);
console.log('Registered /api/shop-collections route in src/app.js');
