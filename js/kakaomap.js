// ===== 카카오맵 초기화 및 유틸 =====
import { KAKAO_JS_KEY } from './firebase-config.js';

let mapInstance = null;
let markerInstance = null;
let infoWindowInstance = null;
let routePolyline = null;

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

  // 기존 오버레이 제거
  if (infoWindowInstance) {
    infoWindowInstance.setMap(null);
    infoWindowInstance = null;
  }

  if (label) {
    // InfoWindow 대신 CustomOverlay 사용 → 텍스트 너비에 딱 맞게 제어 가능
    const content = `
      <div style="text-align:center">
        <div style="
          display:inline-block;
          background:#fff;
          border:1px solid #d0d0d0;
          border-radius:8px;
          padding:6px 14px;
          font-size:13px;
          font-weight:700;
          color:#222;
          white-space:nowrap;
          box-shadow:0 2px 8px rgba(0,0,0,0.15);
        ">${label}</div>
        <div style="
          width:0;height:0;
          border-left:8px solid transparent;
          border-right:8px solid transparent;
          border-top:8px solid #d0d0d0;
          margin:0 auto;
        "></div>
        <div style="height:38px"></div>
      </div>`;
    infoWindowInstance = new kakao.maps.CustomOverlay({
      position: pos,
      content,
      yAnchor: 1,
      zIndex: 1,
    });
    infoWindowInstance.setMap(mapInstance);
  }

  return markerInstance;
}

// 오버레이 닫기
export function closeInfoWindow() {
  if (infoWindowInstance) {
    infoWindowInstance.setMap(null);
    infoWindowInstance = null;
  }
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
      if (mapInstance) {
        const latLng = new kakao.maps.LatLng(lat, lng);
        mapInstance.setCenter(latLng);
        mapInstance.setLevel(4);
        // 지도 컨테이너 크기 재계산 후 렌더링 갱신
        mapInstance.relayout();
        mapInstance.setCenter(latLng);
      }
      resolve({ lat, lng });
    }, (err) => {
      // GeolocationPositionError 코드별 메시지
      const msg = [
        '',
        '위치 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.',
        '위치를 가져올 수 없습니다.',
        '위치 요청 시간이 초과됐습니다.',
      ][err.code] || '위치 오류';
      reject(new Error(msg));
    }, { enableHighAccuracy: true, timeout: 10000 });
  });
}

// 경로 폴리라인 그리기 (straight=true면 점선으로 표시)
export function drawRoute(path, color = '#6c63ff', straight = false) {
  clearRoute();
  if (!mapInstance || !path?.length) return;
  routePolyline = new kakao.maps.Polyline({
    path:           path.map(p => new kakao.maps.LatLng(p.lat, p.lng)),
    strokeWeight:   straight ? 3 : 5,
    strokeColor:    color,
    strokeOpacity:  straight ? 0.5 : 0.8,
    strokeStyle:    straight ? 'shortdot' : 'solid',
  });
  routePolyline.setMap(mapInstance);
}

// 경로 폴리라인 제거
export function clearRoute() {
  if (routePolyline) { routePolyline.setMap(null); routePolyline = null; }
}

// 특정 좌표로 지도 이동
export function centerMapAt(lat, lng, level) {
  if (!mapInstance) return;
  const latLng = new kakao.maps.LatLng(lat, lng);
  if (level) mapInstance.setLevel(level);
  mapInstance.setCenter(latLng);
  mapInstance.relayout();
  mapInstance.setCenter(latLng);
}

export function getMap() { return mapInstance; }
