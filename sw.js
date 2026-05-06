const CACHE_NAME = 'reader-cache-v2';

// 깃허브 레포지토리 이름이 바뀌어도 무조건 작동하도록 상대경로(./) 사용
const urlsToCache =[
    './',
    './index.html',
    './manifest.json',
    './icon-512.png'
];

// 1. 설치할 때 파일들을 캐시에 저장
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('캐시 저장 완료');
                // 만약 여기서 에러가 난다면 icon-512.png 파일이 없거나 이름이 틀린 것입니다.
                return cache.addAll(urlsToCache);
            })
            .catch(err => console.error('캐싱 에러:', err))
    );
    self.skipWaiting();
});

// 2. 앱 활성화 및 이전 캐시(찌꺼기) 삭제
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

// 3. 오프라인(인터넷 끊김) 상태일 때 캐시된 파일 제공
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
