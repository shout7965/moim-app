// ===== FCM 토큰 발급 및 관리 =====
import { messaging, VAPID_KEY, db } from './firebase-config.js';
import { getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { showToast } from '../main.js';

// Service Worker 등록 + FCM 토큰 발급 → Firestore 저장
export async function initFCM(uid) {
  if (!messaging) {
    console.warn('FCM: messaging not available (non-HTTPS or unsupported browser)');
    return null;
  }

  try {
    // Service Worker 등록
    const registration = await navigator.serviceWorker.register('/sw.js');

    // 알림 권한 요청
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('FCM: notification permission denied');
      return null;
    }

    // FCM 토큰 발급
    const token = await getToken(messaging, {
      vapidKey:            VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      console.warn('FCM: no token received');
      return null;
    }

    // Firestore에 토큰 저장
    await updateDoc(doc(db, 'users', uid), { fcmToken: token });
    console.log('FCM token saved:', token.slice(0, 20) + '...');
    return token;
  } catch (err) {
    console.error('FCM init error:', err);
    return null;
  }
}

// 포그라운드 메시지 수신 (앱이 열려 있을 때)
export function setupForegroundMessages() {
  if (!messaging) return;
  onMessage(messaging, (payload) => {
    const { title, body } = payload.notification || {};
    const msg = body ? `${title}: ${body}` : title;
    if (msg) showToast(msg, 'info', 5000);
  });
}
