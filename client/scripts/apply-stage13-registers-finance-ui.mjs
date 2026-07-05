import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'src/pages/BranchTransfers.jsx',
  'src/pages/Batches.jsx',
  'src/pages/Reports.jsx',
  'src/pages/CashBank.jsx',
  'src/pages/Accounting.jsx',
  'src/components/ui/DataTable.jsx',
  'src/components/ui/Pagination.jsx',
  'src/components/ui/ModalDrawer.jsx',
  'src/styles/stage13-registers-finance-polish.css',
  'src/styles/modal-viewport-responsive-fix.css'
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.log('Some Stage 13 files are not present after extraction:');
  for (const file of missing) console.log(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log('Stage 13 UI files are in place. Run npm run dev or npm run build.');
}
