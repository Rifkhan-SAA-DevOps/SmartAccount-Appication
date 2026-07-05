import fs from 'fs';
import path from 'path';

const permissionsPath = path.resolve('src/lib/permissions.js');
if (!fs.existsSync(permissionsPath)) {
  console.warn('src/lib/permissions.js not found. Skipping permission patch.');
  process.exit(0);
}

let permissions = fs.readFileSync(permissionsPath, 'utf8');
if (permissions.includes('shopCollections:*')) {
  console.log('shopCollections permissions already exist.');
  process.exit(0);
}

const modules = ['distribution:*', 'shopSupply:*', 'shopCollections:*'];
const read = ['distribution:read', 'shopSupply:read', 'shopCollections:read'];
const create = ['distribution:read', 'shopSupply:read', 'shopCollections:read', 'shopCollections:create'];

// Prefer simple string insertion after delivery/campaign/dashboardbuilder permissions if they exist.
permissions = permissions
  .replace(/'dashboardbuilder:\*'/g, "'dashboardbuilder:*', 'distribution:*', 'shopSupply:*', 'shopCollections:*'")
  .replace(/'delivery:\*'/g, "'delivery:*', 'distribution:*', 'shopSupply:*', 'shopCollections:*'")
  .replace(/'delivery:read'/g, "'delivery:read', 'distribution:read', 'shopSupply:read', 'shopCollections:read'")
  .replace(/'delivery:create'/g, "'delivery:create', 'distribution:read', 'shopSupply:read', 'shopCollections:create'")
  .replace(/'pos:use'/g, "'pos:use', 'distribution:read', 'shopSupply:read', 'shopCollections:create'");

fs.writeFileSync(permissionsPath, permissions);
console.log('Added basic shopCollections permissions to src/lib/permissions.js');
