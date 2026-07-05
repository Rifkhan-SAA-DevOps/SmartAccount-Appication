import fs from 'fs';
import path from 'path';

const permissionsPath = path.resolve('src/lib/permissions.js');
if (!fs.existsSync(permissionsPath)) {
  console.warn('src/lib/permissions.js not found. Skipping permission patch.');
  process.exit(0);
}

let permissions = fs.readFileSync(permissionsPath, 'utf8');
if (permissions.includes('repMobile:read')) {
  console.log('repMobile permissions already exist.');
  process.exit(0);
}

permissions = permissions
  .replace(/'distribution:\*'/g, "'distribution:*', 'repMobile:*'")
  .replace(/'distribution:read'/g, "'distribution:read', 'repMobile:read'")
  .replace(/'distribution:create'/g, "'distribution:create', 'repMobile:create'")
  .replace(/'distribution:update'/g, "'distribution:update', 'repMobile:update'")
  .replace(/'shopSupply:read'/g, "'shopSupply:read', 'repMobile:read'")
  .replace(/'shopSupply:create'/g, "'shopSupply:create', 'repMobile:create'")
  .replace(/'shopCollections:read'/g, "'shopCollections:read', 'repMobile:read'")
  .replace(/'shopCollections:create'/g, "'shopCollections:create', 'repMobile:create'")
  .replace(/'vanStock:read'/g, "'vanStock:read', 'repMobile:read'")
  .replace(/'vanStock:create'/g, "'vanStock:create', 'repMobile:create'");

fs.writeFileSync(permissionsPath, permissions);
console.log('Added repMobile permissions to src/lib/permissions.js');
