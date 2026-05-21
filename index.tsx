
import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Listen for Service Worker updates to auto-reload the page
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SW_UPDATED') {
      console.log('New version detected! Auto-reloading...');
      window.location.reload();
    }
  });
}
