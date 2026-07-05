import fs from 'fs';
import path from 'path';

const mainPath = path.resolve('src/main.jsx');
const importLine = "import './styles/form-drawer-workflow.css';";

if (fs.existsSync(mainPath)) {
  let src = fs.readFileSync(mainPath, 'utf8');
  if (!src.includes(importLine)) {
    const marker = "import './styles.css';";
    if (src.includes(marker)) {
      src = src.replace(marker, `${marker}\n${importLine}`);
    } else {
      src = `${importLine}\n${src}`;
    }
    fs.writeFileSync(mainPath, src);
    console.log('Added form-drawer-workflow.css import to src/main.jsx');
  } else {
    console.log('form-drawer-workflow.css already imported in src/main.jsx');
  }
} else {
  console.warn('src/main.jsx not found. Please import ./styles/form-drawer-workflow.css manually.');
}
