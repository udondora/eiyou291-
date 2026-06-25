/* 株価判断ダッシュボード Service Worker
   - アプリ本体をキャッシュしてオフライン表示（前回結果はlocalStorageから復元）
   - 株価データAPI/プロキシ/TradingViewは常にネットワーク優先（キャッシュしない） */
const CACHE = 'kabu-dash-v14';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // 同一オリジンのアプリ資産のみキャッシュ対象。外部(API/プロキシ/TV)は素通し。
  const sameOrigin = url.origin === self.location.origin;
  const isAsset = sameOrigin && (url.pathname.endsWith('/') || /\.(html|webmanifest|png|css|js)$/.test(url.pathname));
  if (!isAsset) return; // ネットワークそのまま（キャッシュ介在しない）
  // network-first（最新を取りつつ、オフライン時はキャッシュ）
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
