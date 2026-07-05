import fs from 'fs';
import path from 'path';

const appPath = path.resolve('src/App.jsx');
if (!fs.existsSync(appPath)) {
  console.error('Cannot find client/src/App.jsx. Run this command from the client folder.');
  process.exit(1);
}

let app = fs.readFileSync(appPath, 'utf8');

function addImport(importLine) {
  if (!app.includes(importLine)) {
    const marker = 'function PrivateRoute';
    if (!app.includes(marker)) throw new Error('Could not find function PrivateRoute marker in App.jsx');
    app = app.replace(marker, `${importLine}\n${marker}`);
  }
}

function addRoute(routeLine) {
  if (!app.includes(routeLine)) {
    const preferred = '        <Route path="dashboard-builder" element={<DashboardBuilder />} />';
    if (app.includes(preferred)) {
      app = app.replace(preferred, `${preferred}\n${routeLine}`);
      return;
    }
    const fallback = '        <Route path="users" element={<Users />} />';
    if (app.includes(fallback)) {
      app = app.replace(fallback, `${routeLine}\n${fallback}`);
      return;
    }
    throw new Error('Could not find a safe route insertion place in App.jsx');
  }
}

addImport("import SmartAssistant from './pages/SmartAssistant.jsx';");
addImport("import SmartAlerts from './pages/SmartAlerts.jsx';");
addRoute('        <Route path="smart-assistant" element={<SmartAssistant />} />');
addRoute('        <Route path="smart-alerts" element={<SmartAlerts />} />');

fs.writeFileSync(appPath, app);
console.log('✅ Added Smart Assistant and Smart Alerts routes to client/src/App.jsx');
