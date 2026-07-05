import fs from 'fs';
import path from 'path';

const permissionsPath = path.resolve('src/lib/permissions.js');
if (!fs.existsSync(permissionsPath)) {
  console.warn('src/lib/permissions.js not found. Skipping permission patch.');
  process.exit(0);
}

let permissions = fs.readFileSync(permissionsPath, 'utf8');
if (permissions.includes('shopReturns:*')) {
  console.log('shopReturns permissions already exist.');
  process.exit(0);
}

permissions = permissions
  .replace(/'vanStock:\*'/g, "'vanStock:*', 'shopReturns:*'")
  .replace(/'shopCollections:\*'/g, "'shopCollections:*', 'shopReturns:*'")
  .replace(/'shopSupply:\*'/g, "'shopSupply:*', 'shopReturns:*'")
  .replace(/'distribution:\*'/g, "'distribution:*', 'shopReturns:*'")
  .replace(/'return:\*'/g, "'return:*', 'shopReturns:*'")
  .replace(/'vanStock:read'/g, "'vanStock:read', 'shopReturns:read'")
  .replace(/'shopSupply:read'/g, "'shopSupply:read', 'shopReturns:read'")
  .replace(/'distribution:read'/g, "'distribution:read', 'shopReturns:read'")
  .replace(/'return:read'/g, "'return:read', 'shopReturns:read'")
  .replace(/'vanStock:create'/g, "'vanStock:create', 'shopReturns:create'")
  .replace(/'product:update'/g, "'product:update', 'shopReturns:create', 'shopReturns:update'");

fs.writeFileSync(permissionsPath, permissions);
console.log('Added basic shopReturns permissions to src/lib/permissions.js');
