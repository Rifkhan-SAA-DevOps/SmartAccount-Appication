import fs from 'fs';
import path from 'path';

const mainPath = path.join(process.cwd(), 'src', 'main.jsx');
const importLine = "import './styles/finance-reports-modern.css';";

if (!fs.existsSync(mainPath)) {
  console.error('Cannot find client/src/main.jsx. Run this script from the client folder.');
  process.exit(1);
}

let content = fs.readFileSync(mainPath, 'utf8');

if (!content.includes(importLine)) {
  const marker = "import './styles/asip-sidebar.css';";
  if (content.includes(marker)) {
    content = content.replace(marker, `${marker}\n${importLine}`);
  } else {
    content = content.replace("import './styles.css';", `import './styles.css';\n${importLine}`);
  }
  fs.writeFileSync(mainPath, content, 'utf8');
  console.log('Added finance/reports modern UI stylesheet import to src/main.jsx');
} else {
  console.log('finance/reports modern UI stylesheet already imported.');
}
