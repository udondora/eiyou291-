/* 管理栄養士国試 問題集 Service Worker
   - アプリ本体（単一HTML）・アイコン・manifest をキャッシュしてオフライン動作。
   - 学習の進捗記録は localStorage に保存（このSWは触らない）。
   - 新バージョンは「待機」し、ページ上の「更新」操作でのみ切り替える。 */
const CACHE = 'eiyou291-v34';
const ASSETS = [
  './',
  './index.html',
  './eiyou291_v34.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  // skipWaiting はしない（更新はユーザー操作で）
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // 外部は素通し
  const isAsset = url.pathname.endsWith('/') || /\.(html|webmanifest|png|css|js)$/.test(url.pathname);
  if (!isAsset) return;
  // network-first（取れたら最新を保存、ダメならキャッシュ）
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./eiyou291_v34.html')))
  );
});
