import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/app.js');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find src/app.js. Run this from the server folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');

const importLine = "import shopSupplyRoutes from './routes/shopSupply.routes.js';";
if (!app.includes(importLine)) {
  const afterDistribution = "import distributionRoutes from './routes/distribution.routes.js';";
  if (app.includes(afterDistribution)) {
    app = app.replace(afterDistribution, `${afterDistribution}\n${importLine}`);
  } else {
    const marker = "import dashboardBuilderRoutes from './routes/dashboardBuilder.routes.js';";
    app = app.replace(marker, `${marker}\n${importLine}`);
  }
}

const useLine = "app.use('/api/shop-supply', shopSupplyRoutes);";
if (!app.includes(useLine)) {
  const afterDistributionUse = "app.use('/api/distribution', distributionRoutes);";
  if (app.includes(afterDistributionUse)) {
    app = app.replace(afterDistributionUse, `${afterDistributionUse}\n${useLine}`);
  } else {
    const marker = "app.use('/api/dashboard-builder', dashboardBuilderRoutes);";
    app = app.replace(marker, `${marker}\n${useLine}`);
  }
}

fs.writeFileSync(appPath, app);
console.log('Registered /api/shop-supply route in src/app.js');
