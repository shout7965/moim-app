// ===== Cloudflare Worker - 모임앱 API =====
// Secrets (wrangler secret put NAME 으로 등록):
//   KAKAO_REST_API_KEY   - 카카오 REST API 키
//   KAKAO_MOBILITY_KEY   - 카카오 모빌리티 REST API 키
//   FCM_SERVICE_ACCOUNT  - Firebase 서비스 계정 JSON 문자열

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ===== Routing =====
    if (path === '/api/kakao-token' && request.method === 'POST') {
      return handleKakaoToken(request, env);
    }
    if (path === '/api/notify' && request.method === 'POST') {
      return handleNotify(request, env);
    }
    if (path === '/api/transit-eta' && request.method === 'GET') {
      return handleTransitEta(request, env);
    }

    return err('Not found', 404);
  },
};

// ===== POST /api/kakao-token =====
// Body: { code, redirectUri }
// 카카오 인가코드를 액세스 토큰으로 교환 후 사용자 프로필 반환
async function handleKakaoToken(request, env) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { code, redirectUri } = body;
  if (!code || !redirectUri) return err('code and redirectUri required');

  // 1. 액세스 토큰 교환
  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      client_id:    env.KAKAO_REST_API_KEY,
      redirect_uri: redirectUri,
      code,
    }),
  });

  const tokenData = await tokenRes.json();
  if (tokenData.error) return err(tokenData.error_description || tokenData.error, 400);

  // 2. 사용자 프로필 조회
  const profileRes = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: {
      Authorization:  `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  const profile = await profileRes.json();
  if (profile.code) return err(profile.msg || 'Profile error', 400);

  return json({
    kakaoId:    String(profile.id),
    nickname:   profile.kakao_account?.profile?.nickname  || '사용자',
    profileImg: profile.kakao_account?.profile?.profile_image_url || null,
  });
}

// ===== POST /api/notify =====
// Body: { token, title, body, data? }
// FCM v1 API로 푸시 알림 발송
async function handleNotify(request, env) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { token, title, body: msgBody, data = {} } = body;
  if (!token || !title || !msgBody) return err('token, title, body required');

  let serviceAccount;
  try { serviceAccount = JSON.parse(env.FCM_SERVICE_ACCOUNT); } catch {
    return err('FCM_SERVICE_ACCOUNT not configured', 500);
  }

  // JWT 생성 (SubtleCrypto RS256)
  const accessToken = await getGoogleAccessToken(serviceAccount);
  if (!accessToken) return err('Failed to get FCM access token', 500);

  const projectId = serviceAccount.project_id;
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const fcmRes = await fetch(fcmUrl, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body: msgBody },
        data: Object.fromEntries(Object.entries(data).map(([k,v]) => [k, String(v)])),
        webpush: {
          fcm_options: { link: data.url || '/' },
        },
      },
    }),
  });

  const fcmData = await fcmRes.json();
  if (!fcmRes.ok) return err(fcmData.error?.message || 'FCM error', fcmRes.status);
  return json({ success: true, name: fcmData.name });
}

// ===== GET /api/transit-eta =====
// Query: origin_lat, origin_lng, dest_lat, dest_lng
// 카카오 모빌리티 대중교통 경로 탐색
async function handleTransitEta(request, env) {
  const url = new URL(request.url);
  const { origin_lat, origin_lng, dest_lat, dest_lng } = Object.fromEntries(url.searchParams);

  if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
    return err('origin_lat, origin_lng, dest_lat, dest_lng required');
  }

  const mobilityUrl = new URL('https://apis-navi.kakaomobility.com/v1/directions/transit');
  mobilityUrl.searchParams.set('origin',      `${origin_lng},${origin_lat}`);
  mobilityUrl.searchParams.set('destination', `${dest_lng},${dest_lat}`);

  const res = await fetch(mobilityUrl.toString(), {
    headers: { Authorization: `KakaoAK ${env.KAKAO_MOBILITY_KEY}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return err(`Mobility API error: ${text}`, res.status);
  }

  const data = await res.json();
  // routes[0].summary.duration 은 초 단위
  const durationSec = data.routes?.[0]?.summary?.duration;
  if (durationSec == null) return err('No route found');

  return json({ minutes: Math.ceil(durationSec / 60) });
}

// ===== Google OAuth JWT Helper =====
async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss:   serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  };

  const encode = (obj) => btoa(JSON.stringify(obj))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Parse PEM key
  const pemKey = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const keyBytes = Uint8Array.from(atob(pemKey), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  return tokenData.access_token || null;
}
