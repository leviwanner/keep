// Define the cache name and the URLs to be cached.
const CACHE_NAME = 'keep-journal-cache-v3';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/client.js',
  '/styles/style.css',
  '/static/icon-192.png',
  '/static/icon-512.png',
  '/static/favicon.ico'
];

// Install event: triggered when the service worker is first installed.
self.addEventListener('install', event => {
  // Wait until the cache is opened and all specified URLs are cached.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event: triggered for every network request made by the page.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first strategy for API calls.
  // This ensures that the user always gets the latest data from the server.
  // If the network request fails, it falls back to the cache.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone the response to store it in the cache while also returning it to the browser.
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          return response;
        })
        .catch(() => {
          // If the network request fails, try to serve the response from the cache.
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache-first strategy for static assets.
  // This serves assets from the cache if they are available, which makes the app load faster.
  // If an asset is not in the cache, it is fetched from the network.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Activate event: triggered when the service worker is activated.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  // Remove old caches to free up space.
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});