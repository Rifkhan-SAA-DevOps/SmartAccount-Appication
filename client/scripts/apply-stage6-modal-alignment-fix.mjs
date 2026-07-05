import fs from 'fs';
import path from 'path';

const mainPath = path.resolve('src/main.jsx');
const imports = [
  "import './styles/form-drawer-workflow.css';",
  "import './styles/modal-drawer-responsive-fix.css';"
];

if (!fs.existsSync(mainPath)) {
  console.warn('src/main.jsx not found. Please import ./styles/modal-drawer-responsive-fix.css manually.');
  process.exit(0);
}

let src = fs.readFileSync(mainPath, 'utf8');

for (const importLine of imports) {
  if (src.includes(importLine)) continue;

  const afterFormDrawer = "import './styles/form-drawer-workflow.css';";
  const afterStyles = "import './styles.css';";

  if (importLine.includes('modal-drawer-responsive') && src.includes(afterFormDrawer)) {
    src = src.replace(afterFormDrawer, `${afterFormDrawer}\n${importLine}`);
  } else if (src.includes(afterStyles)) {
    src = src.replace(afterStyles, `${afterStyles}\n${importLine}`);
  } else {
    src = `${importLine}\n${src}`;
  }
}

fs.writeFileSync(mainPath, src);
console.log('Stage 6 modal alignment responsive CSS is imported in src/main.jsx');
