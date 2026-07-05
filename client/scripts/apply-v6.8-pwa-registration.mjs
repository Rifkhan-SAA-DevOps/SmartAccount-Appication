import fs from 'fs';
import path from 'path';

const mainPath = path.resolve('src/main.jsx');
if (!fs.existsSync(mainPath)) {
  console.warn('src/main.jsx not found. Skipping PWA registration check.');
  process.exit(0);
}

let main = fs.readFileSync(mainPath, 'utf8');

const importLine = "import { registerServiceWorker } from './utils/registerServiceWorker.js';";
if (!main.includes(importLine)) {
  const cssMarker = "import './styles.css';";
  if (main.includes(cssMarker)) main = main.replace(cssMarker, `${cssMarker}\n${importLine}`);
  else main = `${importLine}\n${main}`;
}

if (!main.includes('registerServiceWorker();')) {
  main = `${main.trim()}\n\nregisterServiceWorker();\n`;
}

fs.writeFileSync(mainPath, main);
console.log('Checked service worker registration in src/main.jsx');

const utilDir = path.resolve('src/utils');
if (!fs.existsSync(utilDir)) fs.mkdirSync(utilDir, { recursive: true });
const utilPath = path.join(utilDir, 'registerServiceWorker.js');
if (!fs.existsSync(utilPath)) {
  fs.writeFileSync(utilPath, `export function registerServiceWorker() {\n  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;\n\n  window.addEventListener('load', () => {\n    navigator.serviceWorker\n      .register('/sw.js')\n      .catch((error) => console.warn('SmartLedger service worker registration failed:', error));\n  });\n}\n`);
  console.log('Created src/utils/registerServiceWorker.js');
}
