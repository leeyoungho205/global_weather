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
