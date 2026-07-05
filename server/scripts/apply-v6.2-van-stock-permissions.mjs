import fs from 'fs';
import path from 'path';

const permissionsPath = path.resolve('src/lib/permissions.js');
if (!fs.existsSync(permissionsPath)) {
  console.warn('src/lib/permissions.js not found. Skipping permission patch.');
  process.exit(0);
}

let permissions = fs.readFileSync(permissionsPath, 'utf8');
if (permissions.includes('vanStock:*')) {
  console.log('vanStock permissions already exist.');
  process.exit(0);
}

permissions = permissions
  .replace(/'shopCollections:\*'/g, "'shopCollections:*', 'vanStock:*'")
  .replace(/'shopSupply:\*'/g, "'shopSupply:*', 'vanStock:*'")
  .replace(/'distribution:\*'/g, "'distribution:*', 'vanStock:*'")
  .replace(/'inventory:\*'/g, "'inventory:*', 'vanStock:*'")
  .replace(/'shopCollections:read'/g, "'shopCollections:read', 'vanStock:read'")
  .replace(/'shopSupply:read'/g, "'shopSupply:read', 'vanStock:read'")
  .replace(/'distribution:read'/g, "'distribution:read', 'vanStock:read'")
  .replace(/'product:read'/g, "'product:read', 'vanStock:read'")
  .replace(/'shopCollections:create'/g, "'shopCollections:create', 'vanStock:create'")
  .replace(/'product:update'/g, "'product:update', 'vanStock:create', 'vanStock:update'");

fs.writeFileSync(permissionsPath, permissions);
console.log('Added basic vanStock permissions to src/lib/permissions.js');
