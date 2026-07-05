import fs from 'fs';
import path from 'path';

const mainPath = path.resolve('src/main.jsx');
const cssImport = "import './styles/stage19-sidebar-submenu-restore.css';";

if (!fs.existsSync(mainPath)) {
  console.error('Missing src/main.jsx. Run this script from the client folder.');
  process.exit(1);
}

let main = fs.readFileSync(mainPath, 'utf8');
if (!main.includes(cssImport)) {
  const imports = main.match(/^(import[^;]+;\s*)+/m);
  if (imports) {
    const end = imports.index + imports[0].length;
    main = `${main.slice(0, end)}${cssImport}\n${main.slice(end)}`;
  } else {
    main = `${cssImport}\n${main}`;
  }
  fs.writeFileSync(mainPath, main);
}

console.log('Stage 19 sidebar submenu restore fix applied.');
