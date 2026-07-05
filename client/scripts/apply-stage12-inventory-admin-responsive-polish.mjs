import fs from 'fs';
import path from 'path';

const root = process.cwd();
const mainFile = path.join(root, 'src', 'main.jsx');
const importLine = "import './styles/stage12-inventory-admin-responsive.css';";

if (!fs.existsSync(mainFile)) {
  console.error('Cannot find client/src/main.jsx. Run this script from the client folder.');
  process.exit(1);
}

let code = fs.readFileSync(mainFile, 'utf8');
if (!code.includes(importLine)) {
  const lines = code.split(/\r?\n/);
  let insertAt = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith('import ')) insertAt = i + 1;
  }
  lines.splice(insertAt, 0, importLine);
  code = lines.join('\n');
  fs.writeFileSync(mainFile, code);
  console.log('Added Stage 12 responsive CSS import to src/main.jsx');
} else {
  console.log('Stage 12 responsive CSS import already exists.');
}
