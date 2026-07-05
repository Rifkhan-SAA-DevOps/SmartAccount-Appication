import fs from 'fs';
import path from 'path';

function patchFile(filePath, patcher) {
  const full = path.resolve(filePath);
  if (!fs.existsSync(full)) {
    console.warn(`Skip missing file: ${filePath}`);
    return;
  }
  const before = fs.readFileSync(full, 'utf8');
  const after = patcher(before);
  if (after !== before) {
    fs.writeFileSync(full, after);
    console.log(`Updated ${filePath}`);
  } else {
    console.log(`No change needed: ${filePath}`);
  }
}

patchFile('src/app.js', (text) => {
  let out = text;
  if (!out.includes("./routes/distribution.routes.js")) {
    const anchor = "import dashboardBuilderRoutes from './routes/dashboardBuilder.routes.js';";
    out = out.includes(anchor)
      ? out.replace(anchor, `${anchor}\nimport distributionRoutes from './routes/distribution.routes.js';`)
      : out.replace("import { errorHandler, notFound } from './middleware/errorHandler.js';", "import distributionRoutes from './routes/distribution.routes.js';\nimport { errorHandler, notFound } from './middleware/errorHandler.js';");
  }
  if (!out.includes("/api/distribution")) {
    const anchorUse = "app.use('/api/dashboard-builder', dashboardBuilderRoutes);";
    out = out.includes(anchorUse)
      ? out.replace(anchorUse, `${anchorUse}\napp.use('/api/distribution', distributionRoutes);`)
      : out.replace('app.use(notFound);', "app.use('/api/distribution', distributionRoutes);\n\napp.use(notFound);");
  }
  out = out.replace("version: '4.5.0'", "version: '5.9.0'");
  return out;
});

const appPath = path.resolve('../client/src/App.jsx');
if (fs.existsSync(appPath)) {
  let text = fs.readFileSync(appPath, 'utf8');
  if (!text.includes("./pages/Distribution.jsx")) {
    const anchor = "import Campaigns from './pages/Campaigns.jsx';";
    text = text.includes(anchor)
      ? text.replace(anchor, `${anchor}\nimport Distribution from './pages/Distribution.jsx';`)
      : text.replace("import DashboardBuilder from './pages/DashboardBuilder.jsx';", "import DashboardBuilder from './pages/DashboardBuilder.jsx';\nimport Distribution from './pages/Distribution.jsx';");
  }
  if (!text.includes('path="distribution"')) {
    const anchorRoute = '<Route path="campaigns" element={<Campaigns />} />';
    text = text.includes(anchorRoute)
      ? text.replace(anchorRoute, `${anchorRoute}\n        <Route path="distribution" element={<Distribution />} />`)
      : text.replace('<Route path="users" element={<Users />} />', '<Route path="distribution" element={<Distribution />} />\n        <Route path="users" element={<Users />} />');
  }
  fs.writeFileSync(appPath, text);
  console.log('Updated ../client/src/App.jsx');
} else {
  console.warn('Skip missing ../client/src/App.jsx');
}

console.log('Code patch complete. Add a sidebar link manually if your custom sidebar was heavily modified. Suggested route: /distribution');
