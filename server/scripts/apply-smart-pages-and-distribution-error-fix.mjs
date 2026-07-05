import fs from 'fs';
import path from 'path';

function read(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content);
}

function patchAppJs() {
  const file = path.resolve('src/app.js');
  let app = read(file);
  if (!app) {
    console.error('Cannot find server/src/app.js. Run this command from the server folder.');
    process.exit(1);
  }

  if (!app.includes("./routes/assistant.routes.js")) {
    app = app.replace(
      "import { errorHandler, notFound } from './middleware/errorHandler.js';",
      "import assistantRoutes from './routes/assistant.routes.js';\nimport { errorHandler, notFound } from './middleware/errorHandler.js';"
    );
  }

  if (!app.includes("./routes/smartAlerts.routes.js")) {
    app = app.replace(
      "import { errorHandler, notFound } from './middleware/errorHandler.js';",
      "import smartAlertsRoutes from './routes/smartAlerts.routes.js';\nimport { errorHandler, notFound } from './middleware/errorHandler.js';"
    );
  }

  if (!app.includes("app.use('/api/assistant', assistantRoutes);")) {
    const marker = "app.use('/api/dashboard-builder', dashboardBuilderRoutes);";
    if (app.includes(marker)) {
      app = app.replace(marker, `${marker}\napp.use('/api/assistant', assistantRoutes);`);
    } else {
      app = app.replace('app.use(notFound);', "app.use('/api/assistant', assistantRoutes);\napp.use(notFound);");
    }
  }

  if (!app.includes("app.use('/api/smart-alerts', smartAlertsRoutes);")) {
    const marker = "app.use('/api/assistant', assistantRoutes);";
    if (app.includes(marker)) {
      app = app.replace(marker, `${marker}\napp.use('/api/smart-alerts', smartAlertsRoutes);`);
    } else {
      app = app.replace('app.use(notFound);', "app.use('/api/smart-alerts', smartAlertsRoutes);\napp.use(notFound);");
    }
  }

  write(file, app);
  console.log('✅ Added Smart Assistant and Smart Alerts backend routes to server/src/app.js');
}

function patchPermissions() {
  const file = path.resolve('src/lib/permissions.js');
  let content = read(file);
  if (!content) {
    console.warn('⚠️  server/src/lib/permissions.js not found. Skipping permissions patch.');
    return;
  }

  const roleAdds = {
    ADMIN: ["'assistant:*'", "'smartalert:*'"],
    ACCOUNTANT: ["'assistant:*'", "'smartalert:*'"],
    INVENTORY_MANAGER: ["'assistant:*'", "'smartalert:*'"],
    CASHIER: ["'assistant:read'", "'smartalert:read'"],
    SALES_STAFF: ["'assistant:read'", "'smartalert:read'"],
    VIEWER: ["'assistant:read'", "'smartalert:read'"],
    AUDITOR: ["'assistant:read'", "'smartalert:read'"]
  };

  for (const [role, perms] of Object.entries(roleAdds)) {
    const re = new RegExp(`(${role}\\s*:\\s*\\[)([\\s\\S]*?)(\\])`, 'm');
    const match = content.match(re);
    if (!match) continue;
    let body = match[2];
    const missing = perms.filter((p) => !body.includes(p));
    if (!missing.length) continue;
    const trimmed = body.trimEnd();
    const separator = trimmed && !trimmed.trim().endsWith(',') ? ',' : '';
    body = `${trimmed}${separator} ${missing.join(', ')}\n  `;
    content = content.replace(re, `$1${body}$3`);
  }

  write(file, content);
  console.log('✅ Added assistant/smartalert permissions where missing');
}

function patchEmployeeIsActive() {
  const files = [
    'src/routes/shopReturns.routes.js',
    'src/routes/shopSupply.routes.js',
    'src/routes/vanStock.routes.js',
    'src/routes/repMobile.routes.js',
    'src/routes/distributorDashboard.routes.js',
    'src/routes/distributorReports.routes.js'
  ];

  for (const relative of files) {
    const file = path.resolve(relative);
    let content = read(file);
    if (!content) continue;
    const before = content;

    // Employee model in your Prisma schema uses status, not isActive.
    // So only employee.findMany filters should be changed.
    content = content.replaceAll(
      "prisma.employee.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, take: 100 }).catch(() => [])",
      "prisma.employee.findMany({ where: { tenantId, status: { not: 'INACTIVE' } }, orderBy: { name: 'asc' }, take: 100 }).catch(() => [])"
    );

    content = content.replaceAll(
      "prisma.employee.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } }).catch(() => [])",
      "prisma.employee.findMany({ where: { tenantId, status: { not: 'INACTIVE' } }, orderBy: { name: 'asc' } }).catch(() => [])"
    );

    content = content.replaceAll(
      "prisma.employee?.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } }) || []",
      "prisma.employee?.findMany({ where: { tenantId, status: { not: 'INACTIVE' } }, orderBy: { name: 'asc' } }) || []"
    );

    // Extra safety for future same-pattern code.
    content = content.replace(
      /(prisma\.employee\??\.findMany\(\{\s*where:\s*\{\s*tenantId,\s*)isActive:\s*true(\s*\})/g,
      "$1status: { not: 'INACTIVE' }$2"
    );

    if (content !== before) {
      write(file, content);
      console.log(`✅ Fixed Employee isActive filter in ${relative}`);
    }
  }
}

patchAppJs();
patchPermissions();
patchEmployeeIsActive();
console.log('✅ Smart pages + distribution employee status fix complete');
