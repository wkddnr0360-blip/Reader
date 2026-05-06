const CACHE_NAME = 'pacemaker-v2';
// 깃허브 페이지 경로에 맞춰 캐싱할 파일 목록 지정
const urlsToCache = [
    '/Pacemaker24/',
    '/Pacemaker24/index.html',
    '/Pacemaker24/manifest.json',
    '/Pacemaker24/icon-512.png'
];

// 1. 설치할 때 파일들을 캐시에 저장
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

// 2. 앱 활성화 및 이전 캐시 삭제
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    event.waitUntil(clients.claim());
});

// 3. 인터넷이 끊겼을 때 캐시된 파일 제공
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
