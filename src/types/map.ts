// 맵/지구본 관련 타입 정의

// 위치 좌표
export interface Location {
  lat: number;
  lng: number;
  name?: string;       // 지역명 (선택)
  country?: string;    // 국가명 (선택)
}

// 지구본 카메라 뷰
export interface GlobePointOfView {
  lat: number;
  lng: number;
  altitude: number;  // 카메라 고도 (지구 반지름 배수)
}

// 활성 레이어 타입
// satellite: 실제 위성 구름 / radar: 구름 + 레이더(비·눈) / temperature·wind: 기온·풍속 색 지도
export type LayerType = 'satellite' | 'radar' | 'temperature' | 'wind';

// 켜고 끌 수 있는 지도 오버레이 (Globe View 2D 앱과 같은 목록)
export interface Overlays {
  radar: boolean; // 레이더(비·눈) — RainViewer. 어느 지도 위에나 겹쳐 볼 수 있습니다
  clouds: boolean; // 위성 구름
  wind: boolean; // 바람 애니메이션 (파티클)
  heat: boolean; // 고온 지점(산불 등)
  storms: boolean; // 열대 저기압(태풍)
  labels: boolean; // 도시 이름
  lines: boolean; // 나라 경계선
  graticule: boolean; // 위도/경도 격자
  crosshair: boolean; // 화면 가운데 십자선
}

// 지오코딩 검색 결과
export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  countryCode: string;
  admin1?: string;    // 시/도
}

// Open-Meteo 지오코딩 API 응답
export interface GeocodingResponse {
  results?: GeocodingResult[];
}
