import fs from 'fs';
import path from 'path';

const root = process.cwd();
const mainPath = path.join(root, 'src', 'main.jsx');
const cssImport = "import './styles/work-service-responsive-stage7.css';";

if (!fs.existsSync(mainPath)) {
  console.error('Cannot find client/src/main.jsx. Run this script from the client folder.');
  process.exit(1);
}

let main = fs.readFileSync(mainPath, 'utf8');

if (!main.includes(cssImport)) {
  const importLines = main.match(/^import .*$/gm) || [];
  const lastImport = importLines[importLines.length - 1];
  if (lastImport) {
    const insertAt = main.indexOf(lastImport) + lastImport.length;
    main = `${main.slice(0, insertAt)}\n${cssImport}${main.slice(insertAt)}`;
  } else {
    main = `${cssImport}\n${main}`;
  }
  fs.writeFileSync(mainPath, main);
  console.log('Added Stage 7 responsive CSS import to src/main.jsx');
} else {
  console.log('Stage 7 responsive CSS import already exists in src/main.jsx');
}

console.log('Stage 7 work/service responsive UI patch applied.');
