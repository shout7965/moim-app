// ===== GPS 위치 추적 및 Firestore 업로드 =====
import { updateMemberLocation } from './db.js';

const MIN_DISTANCE_METERS = 50; // 50m 이상 이동 시에만 업로드

let watchId = null;
let lastLat = null;
let lastLng = null;

// Haversine 거리 계산 (미터)
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 위치 추적 시작
export function startLocationTracking(meetingId, uid, onUpdate, onEtaUpdate) {
  if (!navigator.geolocation) {
    console.warn('Geolocation not supported');
    return null;
  }

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;

      // 정확도가 너무 낮으면 건너뜀 (100m 이상)
      if (accuracy > 100) return;

      // 50m 미만 이동이면 업로드 생략
      if (lastLat !== null && lastLng !== null) {
        const dist = haversineMeters(lastLat, lastLng, lat, lng);
        if (dist < MIN_DISTANCE_METERS) return;
      }

      lastLat = lat;
      lastLng = lng;

      if (onUpdate) onUpdate(lat, lng);

      // ETA는 별도 계산 후 함께 업로드
      const eta = onEtaUpdate ? await onEtaUpdate(lat, lng) : null;

      try {
        await updateMemberLocation(meetingId, uid, lat, lng, eta);
      } catch (e) {
        console.warn('Location upload error:', e);
      }
    },
    (err) => console.warn('Geolocation error:', err),
    {
      enableHighAccuracy: true,
      timeout:            30000,
      maximumAge:         5000,
    },
  );

  return watchId;
}

// 위치 추적 중지
export function stopLocationTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    lastLat = null;
    lastLng = null;
  }
}

// 현재 위치 1회 조회
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}
