// Service Worker — KILL SWITCH
// =============================
// Why this file exists as a kill-switch:
//   Earlier versions of myhomeusb shipped a fetch-intercepting SW that, on
//   network failure, returned a literal "Offline" string. When users in the
//   office hit a network block, the SW would serve that bare "Offline" text
//   instead of letting the browser show its own (recoverable) error page —
//   and because SWs are sticky, the page stayed broken even AFTER the network
//   came back. This was a self-inflicted denial-of-service.
//
// What this file does now:
//   1. Skips the install / waiting phase immediately.
//   2. On activate it: (a) deletes every cache it owns, (b) unregisters
//      itself, (c) reloads every open tab so the page fetches normally
//      from the network instead of from the dead SW.
//   3. Has NO fetch handler — so requests go straight to the network /
//      browser cache. The browser's own network-error UI (which the user
//      can refresh / debug) is used instead of a custom "Offline" string.
//
// Result: any laptop that ever installed the bad SW will, on next visit,
// silently clean itself up and never get the "Offline" page again.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) { /* noop */ }
    try {
      await self.registration.unregister();
    } catch (e) { /* noop */ }
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => { try { client.navigate(client.url); } catch (e) {} });
    } catch (e) { /* noop */ }
  })());
});
