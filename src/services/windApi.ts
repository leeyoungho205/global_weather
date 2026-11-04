// 전지구 바람 격자 API (Open-Meteo) — nullschool 스타일 입자 흐름용
//
// Open-Meteo는 콤마로 구분된 다중 좌표를 한 번의 요청으로 받을 수 있다.
// 전지구를 10° 간격 격자(17×36=612점)로 받아 풍속/풍향을 u,v 벡터로 변환한다.

// ── 격자 정의 ──────────────────────────────────────────────
// Open-Meteo 무료 한도(분당 ~600콜)를 넘지 않도록 격자를 15°로 설정.
// 15° 격자(11×24=264점)는 한 번의 요청으로 받고, 양선형 보간으로 부드럽게 만든다.
const LAT_MIN = -75;
const LAT_MAX = 75;
const LNG_MIN = -180;
const STEP = 15; // 격자 간격(도)
const N_LAT = (LAT_MAX - LAT_MIN) / STEP + 1; // 11
const N_LNG = 360 / STEP; // 24 (경도 -180 ~ 165, 마지막은 -180으로 순환)

// 바람 격자 데이터 구조
export interface WindGrid {
  nLat: number;
  nLng: number;
  latMin: number;
  lngMin: number;
  step: number;
  u: Float32Array; // 동쪽(+) 성분 (km/h)
  v: Float32Array; // 북쪽(+) 성분 (km/h)
}

// 격자 좌표 배열 생성 (행=위도, 열=경도, row-major)
const buildCoords = (): { lats: string; lngs: string } => {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (let r = 0; r < N_LAT; r++) {
    const lat = LAT_MIN + r * STEP;
    for (let c = 0; c < N_LNG; c++) {
      lats.push(lat);
      lngs.push(LNG_MIN + c * STEP);
    }
  }
  return { lats: lats.join(','), lngs: lngs.join(',') };
};

interface PointResponse {
  current: { wind_speed_10m: number; wind_direction_10m: number };
}

// 전지구 바람 격자 가져오기
export const fetchWindGrid = async (): Promise<WindGrid> => {
  const { lats, lngs } = buildCoords();
  const params = new URLSearchParams({
    latitude: lats,
    longitude: lngs,
    current: 'wind_speed_10m,wind_direction_10m',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`바람 데이터 조회 실패: ${res.status}`);

  const data: PointResponse[] = await res.json();
  const n = N_LAT * N_LNG;
  const u = new Float32Array(n);
  const v = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const c = data[i]?.current;
    const speed = c?.wind_speed_10m ?? 0;
    const dirDeg = c?.wind_direction_10m ?? 0;
    const dir = (dirDeg * Math.PI) / 180;
    // 기상학 풍향은 "불어오는 쪽" → 이동 벡터는 반대. u=동, v=북
    u[i] = -speed * Math.sin(dir);
    v[i] = -speed * Math.cos(dir);
  }

  return { nLat: N_LAT, nLng: N_LNG, latMin: LAT_MIN, lngMin: LNG_MIN, step: STEP, u, v };
};

// 격자 밖/경계 처리를 위한 인덱스 클램프 & 경도 순환
const wrapLngIndex = (c: number, nLng: number): number => ((c % nLng) + nLng) % nLng;

// 임의 위경도에서 바람 벡터를 양선형 보간으로 샘플링
// 반환: { u, v, speed } (km/h)
export const sampleWind = (
  grid: WindGrid,
  lat: number,
  lng: number
): { u: number; v: number; speed: number } => {
  const { nLat, nLng, latMin, lngMin, step, u, v } = grid;

  // 격자 좌표계로 변환
  const fr = (lat - latMin) / step; // 실수 행 인덱스
  const fc = (lng - lngMin) / step; // 실수 열 인덱스

  // 위도는 범위 밖이면 샘플 불가 → 0
  if (fr < 0 || fr > nLat - 1) return { u: 0, v: 0, speed: 0 };

  const r0 = Math.floor(fr);
  const r1 = Math.min(r0 + 1, nLat - 1);
  const tr = fr - r0;

  const c0 = wrapLngIndex(Math.floor(fc), nLng);
  const c1 = wrapLngIndex(c0 + 1, nLng);
  const tc = fc - Math.floor(fc);

  // 네 모서리 인덱스
  const i00 = r0 * nLng + c0;
  const i01 = r0 * nLng + c1;
  const i10 = r1 * nLng + c0;
  const i11 = r1 * nLng + c1;

  // 양선형 보간
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const su = lerp(lerp(u[i00], u[i01], tc), lerp(u[i10], u[i11], tc), tr);
  const sv = lerp(lerp(v[i00], v[i01], tc), lerp(v[i10], v[i11], tc), tr);

  return { u: su, v: sv, speed: Math.hypot(su, sv) };
};
