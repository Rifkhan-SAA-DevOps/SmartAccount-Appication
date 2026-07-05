import fs from 'fs';
import path from 'path';

const mainPath = path.resolve('src/main.jsx');
const importLine = "import './styles/stage10-admin-finance-final-polish.css';";

if (!fs.existsSync(mainPath)) {
  console.error('Could not find src/main.jsx. Run this script from the client folder.');
  process.exit(1);
}

let main = fs.readFileSync(mainPath, 'utf8');
if (!main.includes(importLine)) {
  const anchors = [
    "import './styles/stage9-operations-polish.css';",
    "import './styles/work-service-responsive-stage7.css';",
    "import './styles/ui-responsive-hardening.css';",
    "import './styles.css';"
  ];
  let inserted = false;
  for (const anchor of anchors) {
    if (main.includes(anchor)) {
      main = main.replace(anchor, `${anchor}\n${importLine}`);
      inserted = true;
      break;
    }
  }
  if (!inserted) main = `${importLine}\n${main}`;
  fs.writeFileSync(mainPath, main);
  console.log('Added Stage 10 responsive polish stylesheet to src/main.jsx');
} else {
  console.log('Stage 10 stylesheet already imported.');
}
