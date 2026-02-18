// ===== ETA 계산 =====
// 도보/자전거: Haversine 직선거리 기반
// 대중교통: Cloudflare Worker → 카카오 모빌리티
import { WORKER_URL } from './firebase-config.js';

const SPEED = {
  walk:    5,   // km/h
  bike:    15,  // km/h
  transit: null, // API 계산
};

// Haversine 직선거리 (km)
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ETA 계산 (분 반환)
export async function calcEta(transport, fromLat, fromLng, toLat, toLng) {
  if (!fromLat || !fromLng || !toLat || !toLng) return null;

  if (transport === 'transit') {
    return calcTransitEta(fromLat, fromLng, toLat, toLng);
  }

  const speed = SPEED[transport] || SPEED.walk;
  const km    = haversineKm(fromLat, fromLng, toLat, toLng);
  // 직선거리에 1.3 계수 적용 (실제 경로 보정)
  return Math.ceil((km * 1.3 / speed) * 60);
}

// 대중교통 ETA (Worker 경유)
async function calcTransitEta(fromLat, fromLng, toLat, toLng) {
  try {
    const url = `${WORKER_URL}/api/transit-eta?origin_lat=${fromLat}&origin_lng=${fromLng}&dest_lat=${toLat}&dest_lng=${toLng}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.warn('Transit ETA error:', data.error);
      // 폴백: 직선 거리 기반 (40km/h 평균)
      return Math.ceil((haversineKm(fromLat, fromLng, toLat, toLng) * 1.5 / 40) * 60);
    }
    return data.minutes;
  } catch (e) {
    console.warn('Transit ETA fetch error:', e);
    return null;
  }
}

// ETA 레이블 (예: "15분" / "도착!")
export function etaLabel(minutes) {
  if (minutes === null || minutes === undefined) return '-';
  if (minutes <= 0) return '도착!';
  if (minutes < 60) return `${minutes}분`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

// ETA CSS 클래스
export function etaClass(minutes) {
  if (minutes === null || minutes === undefined) return '';
  if (minutes <= 3) return 'eta-arrived';
  if (minutes <= 10) return 'eta-close';
  return 'eta-moving';
}
