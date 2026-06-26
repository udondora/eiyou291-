/* 株価判断ダッシュボード Service Worker
   - アプリ本体をキャッシュしてオフライン表示（前回結果はlocalStorageから復元）
   - 株価データAPI/プロキシ/TradingViewは常にネットワーク優先（キャッシュしない）
   - 新バージョンは「待機」し、ページの「更新」操作でのみ切替 */
const CACHE = 'kabu-dash-v34';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  // skipWaitingはしない（更新はユーザー操作で）
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  const isAsset = sameOrigin && (url.pathname.endsWith('/') || /\.(html|webmanifest|png|css|js)$/.test(url.pathname));
  if (!isAsset) return; // 外部(API/プロキシ/TV)は素通し
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
