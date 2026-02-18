// ===== Firebase 설정 =====
// TODO: Firebase 콘솔(console.firebase.google.com)에서 웹 앱 등록 후 아래 값을 교체하세요.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth }        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getMessaging }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js';

const firebaseConfig = {
  apiKey:            "AIzaSyC6D_G51zNflDnHM55gaXl3ulG8o7jpY7I",
  authDomain:        "moim-c78d9.firebaseapp.com",
  projectId:         "moim-c78d9",
  storageBucket:     "moim-c78d9.firebasestorage.app",
  messagingSenderId: "748561079366",
  appId:             "1:748561079366:web:3ecafb46f44f7ba39a7e47",
};

// FCM 웹 푸시 VAPID 공개 키
// Firebase 콘솔 → 프로젝트 설정 → 클라우드 메시징 → 웹 푸시 인증서에서 확인
export const VAPID_KEY = "BGUlxZ-JOpRGOzMhyVNNR20BkRPOWGrD-AgYvVrMo5tEb4L926chRXkNsiLcLY5nXd1JduixkF6PiMe-CA3RskA";

// 카카오 JavaScript 앱 키 (developers.kakao.com → 내 애플리케이션 → 앱 키)
export const KAKAO_JS_KEY = "0c6ec1f0dde9301e4db94fa3f46863a9";

// Cloudflare Worker URL (wrangler deploy 후 실제 URL로 교체)
export const WORKER_URL = "https://moim-app.intoxicated.workers.dev/";

const app = initializeApp(firebaseConfig);

export const auth      = getAuth(app);
export const db        = getFirestore(app);
export const messaging = (() => {
  try { return getMessaging(app); } catch { return null; }
})();
