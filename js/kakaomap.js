// ===== 카카오맵 초기화 및 유틸 =====
import { KAKAO_JS_KEY } from './firebase-config.js';

let mapInstance = null;
let markerInstance = null;

// 카카오맵 SDK 로드
export function loadKakaoMapSDK() {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) { resolve(); return; }
    const s = document.createElement('script');
    // &autoload=false 로 수동 로드 후 kakao.maps.load() 호출
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false`;
    s.onload = () => {
      kakao.maps.load(() => resolve());
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// 지도 초기화
export async function initMap(containerId, options = {}) {
  await loadKakaoMapSDK();
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Map container #${containerId} not found`);

  const opts = {
    center: new kakao.maps.LatLng(options.lat || 37.5665, options.lng || 126.978),
    level:  options.level || 4,
  };
  mapInstance = new kakao.maps.Map(container, opts);
  return mapInstance;
}

// 마커 설정/이동
export function setMarker(lat, lng, label = '') {
  if (!mapInstance) return null;
  const pos = new kakao.maps.LatLng(lat, lng);

  if (!markerInstance) {
    markerInstance = new kakao.maps.Marker({ position: pos, map: mapInstance });
  } else {
    markerInstance.setPosition(pos);
  }
  mapInstance.setCenter(pos);

  if (label) {
    const info = new kakao.maps.InfoWindow({ content: `<div style="padding:4px 8px;font-size:12px">${label}</div>` });
    info.open(mapInstance, markerInstance);
  }

  return markerInstance;
}

// 커스텀 마커 (멤버 위치 표시용)
export function addMemberMarker(lat, lng, label, color = '#6c63ff') {
  const pos     = new kakao.maps.LatLng(lat, lng);
  const content = `
    <div style="
      background:${color};color:#fff;font-size:11px;font-weight:700;
      padding:4px 8px;border-radius:99px;white-space:nowrap;
      box-shadow:0 2px 8px rgba(0,0,0,0.4)
    ">${label}</div>`;
  const overlay = new kakao.maps.CustomOverlay({ position: pos, content, yAnchor: 1.3 });
  overlay.setMap(mapInstance);
  return overlay;
}

// 장소 검색
export function searchPlaces(keyword) {
  return new Promise((resolve, reject) => {
    if (!window.kakao?.maps?.services) { reject(new Error('Services not loaded')); return; }
    const ps = new kakao.maps.services.Places();
    ps.keywordSearch(keyword, (results, status) => {
      if (status === kakao.maps.services.Status.OK) {
        resolve(results.map(r => ({
          name:    r.place_name,
          address: r.address_name,
          lat:     parseFloat(r.y),
          lng:     parseFloat(r.x),
          id:      r.id,
        })));
      } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
        resolve([]);
      } else {
        reject(new Error(`Place search failed: ${status}`));
      }
    });
  });
}

// 현재 위치로 지도 이동
export function centerOnMyLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (mapInstance) mapInstance.setCenter(new kakao.maps.LatLng(lat, lng));
      resolve({ lat, lng });
    }, reject, { enableHighAccuracy: true, timeout: 10000 });
  });
}

export function getMap() { return mapInstance; }
