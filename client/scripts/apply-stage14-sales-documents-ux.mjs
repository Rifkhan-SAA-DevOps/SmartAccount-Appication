import fs from 'fs';
import path from 'path';

const mainPath = path.resolve('src/main.jsx');
const importLine = "import './styles/stage14-sales-documents-polish.css';";

if (fs.existsSync(mainPath)) {
  let content = fs.readFileSync(mainPath, 'utf8');
  if (!content.includes(importLine)) {
    const marker = "import './styles.css';";
    if (content.includes(marker)) {
      content = content.replace(marker, `${marker}\n${importLine}`);
    } else {
      content = `${importLine}\n${content}`;
    }
    fs.writeFileSync(mainPath, content);
    console.log('Added Stage 14 sales documents UI CSS import to src/main.jsx');
  } else {
    console.log('Stage 14 CSS import already exists in src/main.jsx');
  }
} else {
  console.log('src/main.jsx not found. Please import stage14-sales-documents-polish.css manually.');
}
