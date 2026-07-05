import fs from 'fs';
import path from 'path';

const root = process.cwd();
const sidebarPath = path.join(root, 'src', 'components', 'layout', 'Sidebar.jsx');
const cssCandidates = [
  path.join(root, 'src', 'styles', 'asip-sidebar.css'),
  path.join(root, 'src', 'styles.css'),
  path.join(root, 'src', 'index.css'),
  path.join(root, 'src', 'App.css')
];

function mustRead(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing file: ${file}`);
  }
  return fs.readFileSync(file, 'utf8');
}

function write(file, data) {
  fs.writeFileSync(file, data, 'utf8');
  console.log(`Updated: ${path.relative(root, file)}`);
}

function insertAfter(source, needle, addition) {
  if (source.includes(addition.trim())) return source;
  const index = source.indexOf(needle);
  if (index === -1) return source;
  return source.slice(0, index + needle.length) + addition + source.slice(index + needle.length);
}

function replaceAllSafe(source, search, replacement) {
  if (!source.includes(search)) return source;
  return source.split(search).join(replacement);
}

let sidebar = mustRead(sidebarPath);

// 1) Add desktop/mobile state so hover flyout cannot open while hamburger drawer is open.
const desktopStateBlock = `
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 901px)').matches;
  });
`;
if (!sidebar.includes('const [isDesktop, setIsDesktop]')) {
  const anchor = "  const [isFlyoutReady, setIsFlyoutReady] = useState(false);\n";
  sidebar = insertAfter(sidebar, anchor, desktopStateBlock);
}

// 2) Keep isDesktop updated on resize.
const desktopEffectBlock = `
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(min-width: 901px)');
    const updateDesktopState = () => setIsDesktop(media.matches);
    updateDesktopState();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', updateDesktopState);
      return () => media.removeEventListener('change', updateDesktopState);
    }
    media.addListener(updateDesktopState);
    return () => media.removeListener(updateDesktopState);
  }, []);
`;
if (!sidebar.includes('updateDesktopState')) {
  const anchor = "  const activeGroup = menuGroups.find((group) => group.id === activeGroupId);\n";
  sidebar = insertAfter(sidebar, anchor, desktopEffectBlock);
}

// 3) When hamburger/mobile drawer opens, close desktop flyout and disable blur/focus.
const drawerOpenEffectBlock = `
  useEffect(() => {
    if (!isOpen) return;
    setActiveGroupId(null);
    setFlyoutAnchor(null);
    setIsFlyoutReady(false);
    onFocusChange(false);
  }, [isOpen, onFocusChange]);
`;
if (!sidebar.includes('setFlyoutAnchor(null);') || !sidebar.includes('if (!isOpen) return;')) {
  const anchor = "  useEffect(() => {\n    const isDesktop = !window.matchMedia('(max-width: 900px)').matches;";
  if (sidebar.includes(anchor)) {
    sidebar = sidebar.replace(anchor, drawerOpenEffectBlock + "\n  useEffect(() => {\n    const isDesktop = !window.matchMedia('(max-width: 900px)').matches;");
  } else {
    sidebar = insertAfter(sidebar, desktopEffectBlock, drawerOpenEffectBlock);
  }
}

// 4) Focus blur must only happen on real desktop flyout hover, not hamburger drawer.
sidebar = sidebar.replace(
  /onFocusChange\(Boolean\(activeGroupId\) && isDesktop\);/g,
  'onFocusChange(Boolean(activeGroupId) && isDesktop && !isOpen);'
);
sidebar = sidebar.replace(
  /}, \[activeGroupId, onFocusChange\]\);/g,
  '}, [activeGroupId, isDesktop, isOpen, onFocusChange]);'
);

// 5) handleMainClick should use the tracked desktop state instead of a fresh matchMedia call.
sidebar = sidebar.replace(
  /const isMobile = window\.matchMedia\('\(max-width: 900px\)'\)\.matches;/g,
  'const isMobile = !isDesktop;'
);

// 6) Guard openFlyout. This prevents the “second sidebar” flyout when hamburger drawer is open.
if (!sidebar.includes('if (!isDesktop || isOpen) return;')) {
  sidebar = sidebar.replace(
    /function openFlyout\(group, event\) \{\n\s*cancelClose\(\);/,
    `function openFlyout(group, event) {\n    cancelClose();\n    if (!isDesktop || isOpen) return;`
  );
}

// 7) Render desktop flyout only when desktop sidebar is not in hamburger drawer mode.
sidebar = sidebar.replace(
  /\{activeGroup && \(/g,
  '{activeGroup && isDesktop && !isOpen && ('
);

write(sidebarPath, sidebar);

// 8) CSS override: one sidebar only; remove whole-page blur; backdrop only on mobile.
const cssPath = cssCandidates.find((file) => fs.existsSync(file));
if (!cssPath) {
  console.warn('No global/sidebar CSS file found. Sidebar.jsx was fixed, but CSS override was not added.');
  process.exit(0);
}

let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* SmartLedger hamburger double-sidebar and blur safety fix */';
const cssFix = `

${marker}
.sidebar-backdrop {
  display: none;
}

.smart-nav-focus-overlay {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

.smart-app-shell.nav-focus-active .smart-nav-focus-overlay,
.app-shell.nav-focus-active .smart-nav-focus-overlay {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
}

@media (min-width: 901px) {
  .sidebar-backdrop {
    display: none !important;
  }

  .smart-sidebar.is-mobile-open,
  .sidebar.is-mobile-open {
    transform: none !important;
  }
}

@media (max-width: 900px) {
  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 1000;
    border: 0;
    background: rgba(15, 23, 42, .42);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
  }

  .desktop-flyout,
  .sidebar-flyout.desktop-flyout {
    display: none !important;
  }
}
`;
if (!css.includes(marker)) {
  css += cssFix;
  write(cssPath, css);
} else {
  console.log(`Already fixed: ${path.relative(root, cssPath)}`);
}

console.log('\nDone. Run npm run dev or npm run build to test.');
