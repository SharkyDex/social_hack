import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ResidentApp from './ResidentApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ResidentApp />
  </StrictMode>,
);

// PWA: lets the phone "Add to Home Screen" and run full-screen like an app.
// Registered under the app's base (/resident/) so its scope is this app only.
if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  window.addEventListener('load', () =>
    navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL }).catch(() => {}),
  );
}
