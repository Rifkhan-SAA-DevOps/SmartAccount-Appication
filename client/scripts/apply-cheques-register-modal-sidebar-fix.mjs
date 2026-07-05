import fs from 'fs';
import path from 'path';

const mainPath = path.join(process.cwd(), 'src', 'main.jsx');
const imports = [
  "import './styles/cheques-register-modal-fix.css';",
  "import './styles/sidebar-scroll-submenu-repair.css';"
];

if (!fs.existsSync(mainPath)) {
  console.error('Cannot find client/src/main.jsx. Run this script from the client folder.');
  process.exit(1);
}

let content = fs.readFileSync(mainPath, 'utf8');
let changed = false;

for (const importLine of imports) {
  if (content.includes(importLine)) continue;

  const preferredMarkers = [
    "import './styles/cheques-sidebar-scroll-fix.css';",
    "import './styles/finance-reports-modern.css';",
    "import './styles/ui-responsive-hardening.css';",
    "import './styles/responsive-pagination-fix.css';",
    "import './styles/asip-sidebar.css';",
    "import './styles.css';"
  ];

  let inserted = false;
  for (const marker of preferredMarkers) {
    if (content.includes(marker)) {
      content = content.replace(marker, `${marker}\n${importLine}`);
      inserted = true;
      changed = true;
      break;
    }
  }

  if (!inserted) {
    content = `${importLine}\n${content}`;
    changed = true;
  }
}

if (changed) {
  fs.writeFileSync(mainPath, content, 'utf8');
  console.log('Added cheque register modal and sidebar submenu repair CSS imports.');
} else {
  console.log('CSS imports already exist. Nothing changed.');
}
