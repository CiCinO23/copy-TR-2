import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    console.warn('Prevented unhandled promise rejection from interrupting app:', event.reason);
  });

  window.addEventListener('error', (event) => {
    // Prevent non-fatal script or resize-observer errors from crashing mobile WebViews
    if (
      event.message &&
      (event.message.includes('ResizeObserver') || event.message.includes('Script error'))
    ) {
      event.preventDefault();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

