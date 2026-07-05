import fs from 'fs';
import path from 'path';

const mainPath = path.resolve('src/main.jsx');

if (!fs.existsSync(mainPath)) {
  console.error('Missing src/main.jsx. Run this from the client folder.');
  process.exit(1);
}

let main = fs.readFileSync(mainPath, 'utf8');

if (!main.includes("./components/ui/RawTableEnhancer.jsx")) {
  main = main.replace(
    "import App from './App.jsx';",
    "import App from './App.jsx';\nimport RawTableEnhancer from './components/ui/RawTableEnhancer.jsx';"
  );
}

if (!main.includes('<RawTableEnhancer />')) {
  main = main.replace(
    /<AuthProvider>\s*\n\s*<App \/>\s*\n\s*<\/AuthProvider>/,
    `<AuthProvider>\n        <App />\n        <RawTableEnhancer />\n      </AuthProvider>`
  );
}

fs.writeFileSync(mainPath, main);
console.log('Stage 17 raw table enhancer applied to src/main.jsx');
