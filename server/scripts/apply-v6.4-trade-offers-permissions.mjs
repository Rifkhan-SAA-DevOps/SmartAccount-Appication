import fs from 'fs';
import path from 'path';

const permissionsPath = path.resolve('src/lib/permissions.js');
if (!fs.existsSync(permissionsPath)) {
  console.warn('src/lib/permissions.js not found. Skipping permission patch.');
  process.exit(0);
}

let permissions = fs.readFileSync(permissionsPath, 'utf8');
if (permissions.includes('tradeOffers:*')) {
  console.log('tradeOffers permissions already exist.');
  process.exit(0);
}

permissions = permissions
  .replace(/'shopReturns:\*'/g, "'shopReturns:*', 'tradeOffers:*'")
  .replace(/'shopSupply:\*'/g, "'shopSupply:*', 'tradeOffers:*'")
  .replace(/'distribution:\*'/g, "'distribution:*', 'tradeOffers:*'")
  .replace(/'campaign:\*'/g, "'campaign:*', 'tradeOffers:*'")
  .replace(/'shopReturns:read'/g, "'shopReturns:read', 'tradeOffers:read'")
  .replace(/'shopSupply:read'/g, "'shopSupply:read', 'tradeOffers:read'")
  .replace(/'distribution:read'/g, "'distribution:read', 'tradeOffers:read'")
  .replace(/'campaign:read'/g, "'campaign:read', 'tradeOffers:read'")
  .replace(/'product:read'/g, "'product:read', 'tradeOffers:read'")
  .replace(/'shopSupply:create'/g, "'shopSupply:create', 'tradeOffers:read'")
  .replace(/'shopReturns:create'/g, "'shopReturns:create', 'tradeOffers:create', 'tradeOffers:update'");

fs.writeFileSync(permissionsPath, permissions);
console.log('Added basic tradeOffers permissions to src/lib/permissions.js');
