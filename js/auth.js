// ===== 카카오 로그인 + Firebase Auth 연동 =====
import { auth, db, WORKER_URL, KAKAO_JS_KEY } from './firebase-config.js';
import { signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, setDoc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// 6자리 초대코드 생성
export function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// 카카오 SDK 초기화
export function initKakao() {
  return new Promise((resolve) => {
    if (window.Kakao?.isInitialized()) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
    s.integrity = 'sha384-TiCUE00h649CAMonG018J2ujOgDKW/kVWlChEo7pFjkI9x+Gq4zGd8t6t3RQBZJ';
    s.crossOrigin = 'anonymous';
    s.onload = () => {
      Kakao.init(KAKAO_JS_KEY);
      resolve();
    };
    document.head.appendChild(s);
  });
}

// 카카오 리다이렉트 로그인 시작
export async function startKakaoLogin() {
  await initKakao();
  const redirectUri = `${location.origin}/pages/kakao-callback.html`;
  Kakao.Auth.authorize({ redirectUri });
}

// sessionStorage에 저장된 카카오 코드를 처리
export async function handleKakaoCallback() {
  const code        = sessionStorage.getItem('kakao_code');
  const redirectUri = sessionStorage.getItem('kakao_redirect_uri');
  if (!code) return null;

  sessionStorage.removeItem('kakao_code');
  sessionStorage.removeItem('kakao_redirect_uri');

  // Worker를 통해 토큰 교환
  const res = await fetch(`${WORKER_URL}/api/kakao-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri }),
  });
  const kakaoProfile = await res.json();
  if (kakaoProfile.error) throw new Error(kakaoProfile.error);

  // Firebase Anonymous Auth
  const cred = await signInAnonymously(auth);
  const uid  = cred.user.uid;

  // Firestore 사용자 문서 관리
  const userRef  = doc(db, 'users', uid);
  const existing = await getDoc(userRef);

  if (!existing.exists()) {
    await setDoc(userRef, {
      kakaoId:    kakaoProfile.kakaoId,
      nickname:   kakaoProfile.nickname,
      profileImg: kakaoProfile.profileImg || null,
      inviteCode: generateInviteCode(),
      friends:    [],
      fcmToken:   null,
      createdAt:  serverTimestamp(),
    });
  } else {
    await setDoc(userRef, {
      kakaoId:    kakaoProfile.kakaoId,
      nickname:   kakaoProfile.nickname,
      profileImg: kakaoProfile.profileImg || null,
      updatedAt:  serverTimestamp(),
    }, { merge: true });
  }

  const snap = await getDoc(userRef);
  return { user: cred.user, profile: snap.data() };
}

// 현재 로그인 상태 가져오기 (Promise)
export function getCurrentUser() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) { resolve(null); return; }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists()) { resolve(null); return; }
        resolve({ user, profile: snap.data() });
      } catch (e) { reject(e); }
    });
  });
}

// 로그아웃
export async function signOut() {
  await auth.signOut();
  window.location.href = '/index.html';
}
