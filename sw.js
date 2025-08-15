const CACHE_NAME = 'zhihe-ai-v2.1.0'; // ENHANCEMENT: 更新版本号
const CACHE_CRITICAL = 'zhihe-critical-v2.1.0';
const CACHE_STATIC = 'zhihe-static-v2.1.0';

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

self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_CRITICAL).then(cache => cache.addAll(criticalResources)),
      caches.open(CACHE_STATIC).then(cache => cache.addAll(staticResources))
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (![CACHE_CRITICAL, CACHE_STATIC, CACHE_NAME].includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API 请求，网络优先
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: '网络错误' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503
        });
      })
    );
    return;
  }

  // 静态资源，缓存优先
  // FIX: 使用更精确的匹配逻辑
  const isStatic = staticResources.some(res => url.href === new URL(res, self.location.origin).href);
  const isCritical = criticalResources.includes(url.pathname);

  if (isStatic || isCritical) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then(networkResponse => {
          const cache = isStatic ? caches.open(CACHE_STATIC) : caches.open(CACHE_CRITICAL);
          cache.then(c => c.put(request, networkResponse.clone()));
          return networkResponse;
        });
      })
    );
    return;
  }
  
  // 其他请求，网络优先
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// FIX: 移除了不可靠的 setInterval 清理逻辑