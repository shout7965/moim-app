// ===== FCM Service Worker =====
// Firebase Messaging SDK를 사용한 백그라운드 푸시 수신

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// firebase-config.js 와 동일한 값으로 교체
firebase.initializeApp({
  apiKey:            "AIzaSyC6D_G51zNflDnHM55gaXl3ulG8o7jpY7I",
  authDomain:        "moim-c78d9.firebaseapp.com",
  projectId:         "moim-c78d9",
  storageBucket:     "moim-c78d9.firebasestorage.app",
  messagingSenderId: "748561079366",
  appId:             "1:748561079366:web:3ecafb46f44f7ba39a7e47",
});

const messaging = firebase.messaging();

// 백그라운드 메시지 수신 핸들러
messaging.onBackgroundMessage((payload) => {
  console.log('[sw.js] Background message:', payload);

  const { title, body } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || '모임', {
    body:    body || '',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/badge-72.png',
    tag:     data.meetingId || 'moim',
    data:    { url: data.url || '/' },
    actions: [
      { action: 'open',    title: '열기' },
      { action: 'dismiss', title: '닫기' },
    ],
  });
});

// 알림 클릭 시 해당 페이지로 이동
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find(w => w.url.includes(url));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    }),
  );
});

// Service Worker 설치/활성화
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
