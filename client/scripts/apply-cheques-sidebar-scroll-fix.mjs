import fs from 'fs';
import path from 'path';

const mainPath = path.join(process.cwd(), 'src', 'main.jsx');
const importLine = "import './styles/cheques-sidebar-scroll-fix.css';";

if (!fs.existsSync(mainPath)) {
  console.error('Cannot find client/src/main.jsx. Run this script from the client folder.');
  process.exit(1);
}

let content = fs.readFileSync(mainPath, 'utf8');

if (!content.includes(importLine)) {
  const preferredMarkers = [
    "import './styles/finance-reports-modern.css';",
    "import './styles/ui-responsive-hardening.css';",
    "import './styles/asip-sidebar.css';",
    "import './styles.css';"
  ];

  let updated = false;
  for (const marker of preferredMarkers) {
    if (content.includes(marker)) {
      content = content.replace(marker, `${marker}\n${importLine}`);
      updated = true;
      break;
    }
  }

  if (!updated) {
    content = `${importLine}\n${content}`;
  }

  fs.writeFileSync(mainPath, content, 'utf8');
  console.log('Added cheques/sidebar scroll fix stylesheet import to src/main.jsx');
} else {
  console.log('cheques/sidebar scroll fix stylesheet already imported.');
}
