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

// 베이스 레이어 타입 (지도 / 위성 중 택1 = 라디오)
export type BaseLayer = 'map' | 'satellite';

// (구) 활성 레이어 타입 — 하위 호환용. 현재는 오버레이 토글 방식 사용.
export type LayerType = 'base' | 'satellite' | 'radar' | 'wind' | 'storm';

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
