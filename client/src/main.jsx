import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import RawTableEnhancer from './components/ui/RawTableEnhancer.jsx';
import { AuthProvider } from './state/AuthContext.jsx';
import './styles.css';
import './styles/stage14-sales-documents-polish.css';
import './styles/stage15-pos-admin-final-polish.css';
import './styles/asip-sidebar.css';
import './styles/ledger-assets-clickable-stage11.css';
import './styles/stage9-operations-polish.css';
import './styles/stage10-admin-finance-final-polish.css';
import { registerServiceWorker } from './utils/registerServiceWorker.js';
import './styles/stage12-inventory-admin-responsive.css';

import './styles/stage18-sidebar-scroll-distributor-report-fix.css';
import './styles/stage19-sidebar-submenu-restore.css';
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <RawTableEnhancer />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

registerServiceWorker();
