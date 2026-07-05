import fs from 'fs';
import path from 'path';

const root = process.cwd();
const mainPath = path.join(root, 'src', 'main.jsx');
const importLine = "import './styles/stage8-operations-ux.css';";

if (fs.existsSync(mainPath)) {
  let main = fs.readFileSync(mainPath, 'utf8');
  if (!main.includes(importLine)) {
    const marker = "import './styles/asip-sidebar.css';";
    if (main.includes(marker)) {
      main = main.replace(marker, `${marker}\n${importLine}`);
    } else {
      main = main.replace("import './styles.css';", `import './styles.css';\n${importLine}`);
    }
    fs.writeFileSync(mainPath, main);
    console.log('Added Stage 8 operations UI stylesheet import to src/main.jsx');
  } else {
    console.log('Stage 8 operations UI stylesheet already imported');
  }
}
