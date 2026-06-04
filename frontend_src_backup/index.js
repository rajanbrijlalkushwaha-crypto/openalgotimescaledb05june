import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import AuthPage from './components/auth/Auth';
import App from './App.jsx';
import AdminApp from './components/admin/AdminApp';
import './styles/index.css';

// Inject X-Requested-By on every /api/* fetch — blocks direct browser URL access
const _nativeFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  if (url.includes('/api/')) {
    const headers = new Headers(init.headers || {});
    headers.set('X-Requested-By', 'soc-app');
    init = { ...init, headers };
  }
  return _nativeFetch(input, init);
};

const API_BASE = process.env.REACT_APP_API_URL || '';

function MainApp() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/check-session`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setIsAuthenticated(!!data.authenticated);
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  if (!authChecked) return null;

  const params = new URLSearchParams(window.location.search);
  if (params.get('reset_token')) return <AuthPage />;

  if (isAuthenticated) return <App />;
  return <AuthPage onLogin={() => {
    window.history.replaceState(null, '', '/optionchain');
    setIsAuthenticated(true);
  }} />;
}

function Root() {
  if (window.location.pathname === '/admin') return <AdminApp />;
  return <MainApp />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
