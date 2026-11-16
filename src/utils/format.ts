// 숫자·시간·좌표를 보기 좋게 바꾸는 도우미 함수들 (Globe View 2D 앱과 같은 규칙)

// 36.39 → "36° 23′ 북"
export const formatDegrees = (value: number, positive: string, negative: string): string => {
  const abs = Math.abs(value);
  let degrees = Math.floor(abs);
  let minutes = Math.round((abs - degrees) * 60);
  if (minutes === 60) {
    degrees += 1;
    minutes = 0;
  }
  return `${degrees}° ${minutes}′ ${value >= 0 ? positive : negative}`;
};

export const formatLat = (lat: number, decimal = false): string =>
  decimal ? `${lat.toFixed(4)}°` : formatDegrees(lat, '북', '남');

export const formatLng = (lng: number, decimal = false): string =>
  decimal ? `${lng.toFixed(4)}°` : formatDegrees(lng, '동', '서');

// 시계 표시용 조각들
export const clockParts = (date: Date, { utc = false, hour12 = false } = {}) => {
  const month = utc ? date.getUTCMonth() : date.getMonth();
  const day = utc ? date.getUTCDate() : date.getDate();
  let hour = utc ? date.getUTCHours() : date.getHours();
  const minute = utc ? date.getUTCMinutes() : date.getMinutes();
  let ampm = '';
  if (hour12) {
    ampm = hour < 12 ? '오전' : '오후';
    hour = hour % 12 || 12;
  }
  return {
    month: `${month + 1}월`,
    day: `${day}일`,
    hour: String(hour).padStart(2, '0'),
    minute: String(minute).padStart(2, '0'),
    ampm,
  };
};

export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (d: number) => (d * Math.PI) / 180;

// 두 지점 사이 거리 (km) — 지구를 공 모양으로 보고 계산
export const distanceKm = (a: LatLng, b: LatLng): number => {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// 여러 점으로 이루어진 다각형의 넓이 (km², 대략값)
export const areaKm2 = (points: LatLng[]): number => {
  if (points.length < 3) return 0;
  const R = 6371;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += toRad(b.lng - a.lng) * (2 + Math.sin(toRad(a.lat)) + Math.sin(toRad(b.lat)));
  }
  return Math.abs((sum * R * R) / 2);
};

export const formatNumber = (n: number): string => Math.round(n).toLocaleString('ko-KR');

// 세계기상기구(WMO) 날씨 코드 → 아이콘 종류
export type WeatherKind = 'sun' | 'partly' | 'cloud' | 'snow' | 'rain';
export const iconForCode = (code: number): WeatherKind => {
  if (code <= 1) return 'sun'; // 맑음, 대체로 맑음
  if (code === 2) return 'partly'; // 구름 조금
  if (code === 3 || code === 45 || code === 48) return 'cloud'; // 흐림, 안개
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'; // 눈
  return 'rain'; // 이슬비, 비, 소나기, 뇌우
};
