// Minimal service worker — just enough to make the resident page installable
// as a PWA. No offline caching yet (the call needs the network anyway).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  /* network passthrough */
});
