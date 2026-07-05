import fs from 'fs';
import path from 'path';

const permissionsPath = path.resolve('src/lib/permissions.js');
if (!fs.existsSync(permissionsPath)) {
  console.warn('src/lib/permissions.js not found. Skipping permission patch.');
  process.exit(0);
}

let permissions = fs.readFileSync(permissionsPath, 'utf8');
if (permissions.includes('distributorReports:read')) {
  console.log('distributorReports permissions already exist.');
  process.exit(0);
}

permissions = permissions
  .replace(/'reports:\*'/g, "'reports:*', 'distributorReports:*'")
  .replace(/'reports:read'/g, "'reports:read', 'distributorReports:read'")
  .replace(/'distribution:read'/g, "'distribution:read', 'distributorReports:read'")
  .replace(/'shopSupply:read'/g, "'shopSupply:read', 'distributorReports:read'")
  .replace(/'shopCollections:read'/g, "'shopCollections:read', 'distributorReports:read'")
  .replace(/'shopReturns:read'/g, "'shopReturns:read', 'distributorReports:read'")
  .replace(/'vanStock:read'/g, "'vanStock:read', 'distributorReports:read'");

fs.writeFileSync(permissionsPath, permissions);
console.log('Added distributorReports permissions to src/lib/permissions.js');
