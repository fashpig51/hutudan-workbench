// 工作台"小管家"：每次刷新都先去网上拿最新网页，断网才用存在你电脑里的旧版
const CACHE = 'hutudan-cache-v1';
const APP_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'assets/css/style.css',
  'assets/js/config.js',
  'assets/js/crypto.js',
  'assets/js/store.js',
  'assets/js/ui.js',
  'assets/js/sections.js',
  'assets/js/app.js',
  'assets/js/lib/supabase-js.global.js'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(APP_SHELL).catch(function () {});
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部数据(如同步服务器)不管，照常走
  event.respondWith(
    fetch(req, { cache: 'reload' }) // 每次都去网上拿最新，绕开"先存你电脑10分钟"的标签
      .then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./');
        });
      })
  );
});
