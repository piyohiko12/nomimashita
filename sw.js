const PREFIX = 'nomimashita-shell-' + self.registration.scope + '-';
const CACHE = PREFIX + 'v4-1-medicine-delete';
const SHELL = ['./','./index.html','./styles.css','./app.js','./core.js','./storage.js','./wellness.js','./medicine-view.js','./brand-mark.svg',
  './manifest.webmanifest','./icon.svg?v=rose-1','./icon-192.png?v=rose-1','./icon-512.png?v=rose-1','./apple-touch-icon.png?v=rose-1'];
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
));
// The new worker activates only after its complete app shell has been cached.
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url), scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // Only the application shell is cached, never medication data or third-party resources.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') return (await cache.match('./index.html')) || fetch(event.request);
    return (await cache.match(event.request)) || fetch(event.request);
  })());
});
