const CACHE_NAME = 'zhihe-ai-v2.0.0';
const CACHE_CRITICAL = 'zhihe-critical-v2.0.0';
const CACHE_STATIC = 'zhihe-static-v2.0.0';

const criticalResources = [
  '/',
  '/index.html'
];

const staticResources = [
  '/style.css',
  '/script.js',
  '/favicon.ico',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js'
];

const cacheStrategies = {
  'critical': { cache: CACHE_CRITICAL, strategy: 'cache-first', maxAge: 86400 },
  'static': { cache: CACHE_STATIC, strategy: 'cache-first', maxAge: 604800 },
  'api': { strategy: 'network-only' },
  'default': { cache: CACHE_NAME, strategy: 'network-first', maxAge: 3600 }
};

function getResourceType(url) {
  if (url.includes('/api/')) return 'api';
  if (criticalResources.some(resource => url.includes(resource))) return 'critical';
  if (staticResources.some(resource => url.includes(resource))) return 'static';
  return 'default';
}

function isExpired(response, maxAge) {
  if (!response.headers.has('date')) return false;
  const responseDate = new Date(response.headers.get('date'));
  const expiryDate = new Date(responseDate.getTime() + (maxAge * 1000));
  return Date.now() > expiryDate.getTime();
}

async function cacheFirstStrategy(request, cacheName, maxAge) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse && !isExpired(cachedResponse, maxAge)) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const responseClone = networkResponse.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('date', new Date().toUTCString());
      
      const modifiedResponse = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: headers
      });
      
      await cache.put(request, modifiedResponse);
    }
    
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

async function networkFirstStrategy(request, cacheName, maxAge) {
  try {
    const networkResponse = await Promise.race([
      fetch(request),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Network timeout')), 3000)
      )
    ]);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      const responseClone = networkResponse.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('date', new Date().toUTCString());
      
      const modifiedResponse = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: headers
      });
      
      await cache.put(request, modifiedResponse);
    }
    
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

self.addEventListener('install', event => {
  console.log('Service Worker: Installing v2.0.0...');
  
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_CRITICAL).then(cache => {
        console.log('Service Worker: Caching critical resources');
        return cache.addAll(criticalResources.map(url => new Request(url, {cache: 'reload'})));
      }),
      caches.open(CACHE_STATIC).then(cache => {
        console.log('Service Worker: Caching static resources');
        return Promise.allSettled(
          staticResources.map(url => 
            cache.add(new Request(url, {cache: 'reload'})).catch(err => 
              console.warn('Failed to cache:', url, err.message)
            )
          )
        );
      })
    ]).then(() => {
      console.log('Service Worker: All resources cached successfully');
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker: Activating v2.0.0...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (![CACHE_CRITICAL, CACHE_STATIC, CACHE_NAME].includes(cacheName)) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activated successfully');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  const resourceType = getResourceType(url.pathname + url.search);
  const strategy = cacheStrategies[resourceType];
  
  if (strategy.strategy === 'network-only') return;
  
  event.respondWith(
    (async () => {
      try {
        if (strategy.strategy === 'cache-first') {
          return await cacheFirstStrategy(event.request, strategy.cache, strategy.maxAge);
        } else if (strategy.strategy === 'network-first') {
          return await networkFirstStrategy(event.request, strategy.cache, strategy.maxAge);
        }
      } catch (error) {
        console.error('Service Worker: Fetch failed', error);
        
        if (event.request.destination === 'document') {
          const cache = await caches.open(CACHE_CRITICAL);
          const fallbackResponse = await cache.match('/index.html');
          if (fallbackResponse) return fallbackResponse;
        }
        
        return new Response('Network error', {
          status: 408,
          statusText: 'Network timeout'
        });
      }
    })()
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('error', event => {
  console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('Service Worker unhandled rejection:', event.reason);
});

setInterval(() => {
  caches.keys().then(cacheNames => {
    cacheNames.forEach(async cacheName => {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      
      requests.forEach(async request => {
        const response = await cache.match(request);
        const resourceType = getResourceType(new URL(request.url).pathname);
        const strategy = cacheStrategies[resourceType];
        
        if (strategy && isExpired(response, strategy.maxAge)) {
          await cache.delete(request);
        }
      });
    });
  });
}, 3600000);