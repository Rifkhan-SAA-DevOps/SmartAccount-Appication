import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './state/AuthContext.jsx';
import './styles.css';
import './styles/asip-sidebar.css';
import './styles/finance-reports-modern.css';
import './styles/cheques-sidebar-scroll-fix.css';
import './styles/sidebar-scroll-submenu-repair.css';
import './styles/cheques-register-modal-fix.css';
import './styles/ui-responsive-hardening.css';
import { registerServiceWorker } from './utils/registerServiceWorker.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

registerServiceWorker();
