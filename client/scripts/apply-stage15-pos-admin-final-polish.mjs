import fs from 'fs';
import path from 'path';

const mainPath = path.resolve('src/main.jsx');
const importLine = "import './styles/stage15-pos-admin-final-polish.css';";

if (!fs.existsSync(mainPath)) {
  console.log('src/main.jsx not found. Please import stage15-pos-admin-final-polish.css manually.');
  process.exit(0);
}

let content = fs.readFileSync(mainPath, 'utf8');
if (content.includes(importLine)) {
  console.log('Stage 15 CSS import already exists in src/main.jsx');
  process.exit(0);
}

const preferredMarkers = [
  "import './styles/stage14-sales-documents-polish.css';",
  "import './styles/stage13-registers-finance-polish.css';",
  "import './styles/stage12-inventory-admin-responsive.css';",
  "import './styles/stage9-operations-polish.css';",
  "import './styles.css';"
];

let inserted = false;
for (const marker of preferredMarkers) {
  if (content.includes(marker)) {
    content = content.replace(marker, `${marker}\n${importLine}`);
    inserted = true;
    break;
  }
}

if (!inserted) content = `${importLine}\n${content}`;
fs.writeFileSync(mainPath, content);
console.log('Added Stage 15 POS/Admin final polish CSS import to src/main.jsx');
