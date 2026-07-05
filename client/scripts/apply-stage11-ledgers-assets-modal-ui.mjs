import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mainPath = path.join(root, 'src', 'main.jsx');
const importLine = "import './styles/ledger-assets-clickable-stage11.css';";

if (!fs.existsSync(mainPath)) {
  console.error('Cannot find client/src/main.jsx. Run this script from the client folder.');
  process.exit(1);
}

let main = fs.readFileSync(mainPath, 'utf8');
if (!main.includes(importLine)) {
  const sidebarImport = "import './styles/asip-sidebar.css';";
  if (main.includes(sidebarImport)) {
    main = main.replace(sidebarImport, `${sidebarImport}\n${importLine}`);
  } else {
    main = main.replace("import './styles.css';", `import './styles.css';\n${importLine}`);
  }
  fs.writeFileSync(mainPath, main);
  console.log('Added ledger-assets-clickable-stage11.css import to src/main.jsx');
} else {
  console.log('Stage 11 CSS import already exists in src/main.jsx');
}

console.log('Stage 11 Ledgers + Fixed Assets modal UI patch applied.');
