# 모임 - 친구와 약속 앱

친구들과 약속 장소/시간을 정하고, 실시간 GPS로 서로의 위치와 도착 예정 시간을 확인하는 모바일 웹 앱.

## 기능

- **카카오 로그인** - 카카오 계정으로 1초 로그인
- **친구 추가** - 6자리 초대코드로 친구 추가 (카카오 친구 심사 불필요)
- **약속 만들기** - 카카오맵 장소 검색 + 날짜/시간 설정 + 친구 초대
- **실시간 위치 공유** - GPS watchPosition + Firestore 실시간 동기화
- **이동수단별 ETA** - 도보/자전거(Haversine), 대중교통(카카오 모빌리티)
- **푸시 알림** - 약속 초대, 도착 알림 (FCM)
- **PWA** - 홈 화면 추가, 백그라운드 알림 (iOS 16.4+)

## 설정 방법

### 1. Firebase 설정

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성
2. Authentication → 익명 로그인 활성화
3. Firestore → 데이터베이스 생성 (프로덕션 모드)
4. Cloud Messaging → 웹 푸시 인증서 생성 (VAPID 키 복사)
5. 프로젝트 설정 → 웹 앱 추가 → 설정값 복사

### 2. 카카오 설정

1. [카카오 개발자](https://developers.kakao.com)에서 앱 생성
2. 플랫폼 등록: `https://moim-app.workers.dev` + `http://localhost`
3. 카카오 로그인 활성화 → 동의항목: 닉네임(필수), 프로필 이미지(선택)
4. 앱 키 → JavaScript 키, REST API 키 복사
5. 지도 서비스 활성화 (카카오맵 JavaScript 앱 키)
6. 모빌리티 API 신청 (대중교통 ETA용)

### 3. 코드에 설정값 입력

`js/firebase-config.js` 수정:
```js
const firebaseConfig = { /* Firebase 설정값 */ };
export const VAPID_KEY    = "YOUR_VAPID_KEY";
export const KAKAO_JS_KEY = "YOUR_KAKAO_JS_APP_KEY";
export const WORKER_URL   = "https://moim-app.workers.dev";
```

`sw.js` 수정: firebase-config.js 와 동일한 Firebase 설정값 입력

### 4. Cloudflare Secrets 등록

```bash
wrangler secret put KAKAO_REST_API_KEY
wrangler secret put KAKAO_MOBILITY_KEY
wrangler secret put FCM_SERVICE_ACCOUNT   # Firebase 서비스 계정 JSON 전체
```

### 5. Firestore 보안 규칙 배포

```bash
firebase deploy --only firestore:rules
```

### 6. 배포

```bash
wrangler deploy
```

## 로컬 개발

```bash
wrangler dev
```

브라우저에서 `http://localhost:8787` 접속

## 파일 구조

```
├── index.html              # 로그인 (카카오)
├── style.css               # 공통 CSS
├── main.js                 # 공통 유틸 (toast, auth guard)
├── sw.js                   # FCM Service Worker
├── manifest.json           # PWA 매니페스트
├── firestore.rules         # Firestore 보안 규칙
├── worker/index.js         # Cloudflare Worker API
├── js/
│   ├── firebase-config.js  # 설정값 (여기를 수정하세요)
│   ├── auth.js             # 카카오 로그인 연동
│   ├── db.js               # Firestore CRUD 헬퍼
│   ├── kakaomap.js         # 카카오맵
│   ├── location.js         # GPS 추적
│   ├── eta.js              # ETA 계산
│   ├── fcm.js              # FCM 토큰
│   └── invite.js           # 초대코드/공유
└── pages/
    ├── kakao-callback.html # 카카오 인가코드 처리
    ├── home.html           # 약속 목록
    ├── friends.html        # 친구 관리
    ├── create-meeting.html # 약속 만들기
    ├── meeting.html        # 약속 상세
    └── tracking.html       # 실시간 GPS 추적
```
