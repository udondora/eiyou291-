/* 管理栄養士国試 問題集 Service Worker（堅牢版）
   - アプリ本体・CSS・JS・アイコン・manifest をキャッシュしてオフライン動作。
   - インストール時のキャッシュ失敗は握りつぶさない（addAll が失敗すれば install も失敗し、
     パス誤りが「成功したように見えてオフラインで初めて壊れる」事故を防ぐ）。
   - ページ遷移(navigate)のみ HTML へフォールバック。CSS/JS/画像は失敗時に HTML を返さない
     （将来コードを分割した際、CSSリクエストにHTMLが返って謎エラーになるのを防ぐ）。
   - 学習の進捗記録は localStorage に保存（このSWは触らない）。
   - 新バージョンは「待機」し、ページ上の「更新」操作でのみ切り替える。 */
const CACHE = 'eiyou291-v51-20260628';
const ASSETS = [
  './',
  './index.html',   // ルート＝アプリ本体（個別版ファイル名は廃止）
  './app.css?v=51',
  './app.js?v=51',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS); // 失敗したら install も失敗させる（握りつぶさない）
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // 外部(なし想定)は素通し

  // ページ遷移だけ HTML へフォールバック
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        return res;
      }).catch(async () => {
        return (await caches.match('./index.html')) ||
               (await caches.match('./'));
      })
    );
    return;
  }

  // 画像・manifest・CSS・JS は、失敗時に HTML を返さない（同種のキャッシュのみ）
  const isAsset = /\.(html|webmanifest|png|css|js)$/.test(url.pathname);
  if (!isAsset) return;
  event.respondWith(
    fetch(event.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(event.request))
  );
});
