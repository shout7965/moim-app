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

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 8000, retries = 0) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      clearTimeout(id);
      return { res, data };
    } catch (e) {
      clearTimeout(id);
      lastErr = e;
    }
  }
  throw lastErr || new Error('fetch failed');
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
    if (path === '/api/search-places' && request.method === 'GET') {
      return handleSearchPlaces(request, env);
    }
    if (path === '/api/route' && request.method === 'GET') {
      return handleRoute(request, env);
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
// 카카오 모빌리티 대중교통 경로 탐색 (duration 반환)
async function handleTransitEta(request, env) {
  const url = new URL(request.url);
  const { origin_lat, origin_lng, dest_lat, dest_lng } = Object.fromEntries(url.searchParams);

  if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
    return err('origin_lat, origin_lng, dest_lat, dest_lng required');
  }

  const origin      = `${origin_lng},${origin_lat}`;
  const destination = `${dest_lng},${dest_lat}`;

  try {
    const { durationSec } = await getTransitRoute(origin, destination, env, { withPath: false });
    if (durationSec == null) return err('No route found');
    return json({ minutes: Math.ceil(durationSec / 60) });
  } catch (e) {
    return err(`Mobility API error: ${e.message || 'failed'}`, 500);
  }
}

// ===== GET /api/search-places =====
// Query: q (검색어)
// 카카오 Local REST API 키워드 검색 (도메인 제한 없음)
async function handleSearchPlaces(request, env) {
  const url = new URL(request.url);
  const q   = url.searchParams.get('q');
  if (!q) return err('q required');

  const apiUrl = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  apiUrl.searchParams.set('query', q);
  apiUrl.searchParams.set('size',  '8');

  const res = await fetch(apiUrl.toString(), {
    headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` },
  });

  if (!res.ok) return err(`Kakao Local API error: ${res.status}`, res.status);

  const data = await res.json();
  const results = (data.documents || []).map(d => ({
    name:    d.place_name,
    address: d.road_address_name || d.address_name,
    lat:     parseFloat(d.y),
    lng:     parseFloat(d.x),
    id:      d.id,
  }));

  return json({ results });
}

// ===== GET /api/route =====
// Query: origin_lat, origin_lng, dest_lat, dest_lng, transport
// 카카오 모빌리티 경로 탐색 → 폴리라인용 좌표 배열 반환
async function handleRoute(request, env) {
  const url = new URL(request.url);
  const { origin_lat, origin_lng, dest_lat, dest_lng, transport, mode } = Object.fromEntries(url.searchParams);
  if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
    return err('origin_lat, origin_lng, dest_lat, dest_lng required');
  }

  const origin      = `${origin_lng},${origin_lat}`;
  const destination = `${dest_lng},${dest_lat}`;

  const straight = [
    { lat: parseFloat(origin_lat), lng: parseFloat(origin_lng) },
    { lat: parseFloat(dest_lat),   lng: parseFloat(dest_lng) },
  ];

  const withPath = mode !== 'eta';
  try {
    const t = transport || 'walk';
    let path = [];
    let durationSec = null;

    if (t === 'transit') {
      // 대중교통 → 카카오 모빌리티 transit API 우선, 실패 시 도보 경로로 대체
      try {
        const res = await getTransitRoute(origin, destination, env, { withPath });
        path = res.path;
        durationSec = res.durationSec;
      } catch {
        const res = await getOsrmRoute('walking', origin, destination, { withPath });
        path = res.path;
        durationSec = null; // 도보 소요시간은 대중교통 ETA로 부적합 → 클라이언트 추정값 사용
      }
    } else if (t === 'car') {
      // 자가용 → 카카오 모빌리티 자동차 길찾기 우선, 실패 시 OSRM driving
      try {
        const res = await getCarRoute(origin, destination, env, { withPath });
        path = res.path;
        durationSec = res.durationSec;
      } catch {
        const res = await getOsrmRoute('driving', origin, destination, { withPath });
        path = res.path;
        durationSec = res.durationSec;
      }
    } else if (t === 'walk' || t === 'bike') {
      // 도보/자전거 → OSRM 공개 라우터 (cycling 프로파일이 walking과 동일하므로 walking 사용)
      const res = await getOsrmRoute('walking', origin, destination, { withPath });
      path = res.path;
      // 자전거는 도보의 3배 속도(15km/h vs 5km/h)로 ETA 환산
      durationSec = res.durationSec != null
        ? (t === 'bike' ? Math.round(res.durationSec / 3) : res.durationSec)
        : null;
    } else {
      return json({ path: straight, straight: true, durationSec: null });
    }

    if (path.length > 2) return json({ path, straight: false, durationSec });
    return json({ path: straight, straight: true, durationSec });
  } catch (e) {
    return json({ path: straight, straight: true, durationSec: null });
  }
}

async function getTransitRoute(origin, destination, env, { withPath } = { withPath: true }) {
  const u = new URL('https://apis-navi.kakaomobility.com/v1/directions/transit');
  u.searchParams.set('origin', origin);
  u.searchParams.set('destination', destination);
  const { res, data } = await fetchJsonWithTimeout(
    u.toString(),
    { headers: { Authorization: `KakaoAK ${env.KAKAO_MOBILITY_KEY}` } },
    8000,
    1,
  );
  if (!res.ok || !data.routes?.length) throw new Error(data.msg || 'no route');

  const durationSec = data.routes?.[0]?.summary?.duration ?? null;
  if (!withPath) return { path: [], durationSec };

  const path = [];
  for (const section of (data.routes[0].sections ?? [])) {
    // 도보 구간: roads vertexes
    for (const road of (section.roads ?? [])) {
      const v = road.vertexes ?? [];
      for (let i = 0; i < v.length; i += 2) path.push({ lng: v[i], lat: v[i + 1] });
    }
    // 버스 구간: bus.stations
    for (const st of (section.bus?.stations ?? [])) {
      path.push({ lng: st.x, lat: st.y });
    }
    // 지하철 구간: subway.stations
    for (const st of (section.subway?.stations ?? [])) {
      path.push({ lng: st.x, lat: st.y });
    }
  }
  return { path, durationSec };
}

async function getCarRoute(origin, destination, env, { withPath } = { withPath: true }) {
  const u = new URL('https://apis-navi.kakaomobility.com/v1/directions');
  u.searchParams.set('origin', origin);
  u.searchParams.set('destination', destination);
  u.searchParams.set('summary', 'true');
  u.searchParams.set('road_details', 'false');
  u.searchParams.set('alternatives', 'false');
  u.searchParams.set('priority', 'RECOMMEND');

  const { res, data } = await fetchJsonWithTimeout(
    u.toString(),
    { headers: { Authorization: `KakaoAK ${env.KAKAO_MOBILITY_KEY}` } },
    8000,
    1,
  );
  if (!res.ok || !data.routes?.length) throw new Error(data.msg || 'no route');

  const durationSec = data.routes?.[0]?.summary?.duration ?? null;
  if (!withPath) return { path: [], durationSec };

  const path = [];
  for (const section of (data.routes[0].sections ?? [])) {
    for (const road of (section.roads ?? [])) {
      const v = road.vertexes ?? [];
      for (let i = 0; i < v.length; i += 2) path.push({ lng: v[i], lat: v[i + 1] });
    }
  }
  return { path, durationSec };
}

async function getOsrmRoute(profile, origin, destination, { withPath } = { withPath: true }) {
  const u = new URL(`https://router.project-osrm.org/route/v1/${profile}/${origin};${destination}`);
  u.searchParams.set('overview', withPath ? 'full' : 'false');
  u.searchParams.set('geometries', 'geojson');
  u.searchParams.set('alternatives', 'false');
  u.searchParams.set('steps', 'false');

  const { res, data } = await fetchJsonWithTimeout(u.toString(), {}, 6000, 1);
  if (!res.ok || data.code !== 'Ok' || !data.routes?.length) throw new Error('no route');

  const durationSec = data.routes?.[0]?.duration ?? null;
  if (!withPath) return { path: [], durationSec };

  const coords = data.routes[0].geometry?.coordinates ?? [];
  return { path: coords.map(([lng, lat]) => ({ lng, lat })), durationSec };
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
