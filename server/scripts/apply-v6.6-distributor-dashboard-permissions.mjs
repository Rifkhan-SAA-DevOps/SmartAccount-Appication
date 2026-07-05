import fs from 'fs';
import path from 'path';

const permissionsPath = path.resolve('src/lib/permissions.js');
if (!fs.existsSync(permissionsPath)) {
  console.warn('src/lib/permissions.js not found. Skipping permission patch.');
  process.exit(0);
}

let permissions = fs.readFileSync(permissionsPath, 'utf8');
if (permissions.includes('distributorDashboard:read')) {
  console.log('distributorDashboard permissions already exist.');
  process.exit(0);
}

permissions = permissions
  .replace(/'reports:\*'/g, "'reports:*', 'distributorDashboard:*'")
  .replace(/'reports:read'/g, "'reports:read', 'distributorDashboard:read'")
  .replace(/'distributorReports:read'/g, "'distributorReports:read', 'distributorDashboard:read'")
  .replace(/'distribution:read'/g, "'distribution:read', 'distributorDashboard:read'")
  .replace(/'shopSupply:read'/g, "'shopSupply:read', 'distributorDashboard:read'")
  .replace(/'shopCollections:read'/g, "'shopCollections:read', 'distributorDashboard:read'")
  .replace(/'shopReturns:read'/g, "'shopReturns:read', 'distributorDashboard:read'")
  .replace(/'vanStock:read'/g, "'vanStock:read', 'distributorDashboard:read'");

fs.writeFileSync(permissionsPath, permissions);
console.log('Added distributorDashboard permissions to src/lib/permissions.js');
