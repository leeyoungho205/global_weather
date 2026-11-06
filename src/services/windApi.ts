// 바람 격자 API (Open-Meteo) — nullschool 스타일 입자 흐름용
//
// Open-Meteo는 콤마로 구분된 다중 좌표를 한 번의 요청으로 받을 수 있다.
// ▸ 축소(전지구) 상태: 15° 간격 전지구 격자(11×24=264점) 1요청.
// ▸ 확대 상태: 보이는 영역만 조밀한 격자(16×16=256점)로 받아 → 국지 바람까지 반영.
// 두 경우 모두 점 수를 ~260 이하로 유지해 무료 한도(분당 ~600콜)를 지킨다.

import { viewHalfSpan, type View } from '../utils/viewSpan';

// ── 전지구 격자 상수 ──────────────────────────────────────
const G_LAT_MIN = -75;
const G_LAT_MAX = 75;
const G_STEP = 15;
const G_N_LAT = (G_LAT_MAX - G_LAT_MIN) / G_STEP + 1; // 11
const G_N_LNG = 360 / G_STEP; // 24

// 바람 격자 데이터 구조
export interface WindGrid {
  nLat: number;
  nLng: number;
  latMin: number;
  lngMin: number;
  latStep: number; // 위도 간격(도)
  lngStep: number; // 경도 간격(도)
  global: boolean; // true=경도 순환(전지구), false=국지(범위 밖은 0)
  u: Float32Array; // 동쪽(+) 성분 (km/h)
  v: Float32Array; // 북쪽(+) 성분 (km/h)
}

interface PointResponse {
  current: { wind_speed_10m: number; wind_direction_10m: number };
}

// 격자 정의로 Open-Meteo에 요청해 WindGrid 생성
const fetchGrid = async (
  latMin: number,
  lngMin: number,
  latStep: number,
  lngStep: number,
  nLat: number,
  nLng: number,
  global: boolean
): Promise<WindGrid> => {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (let r = 0; r < nLat; r++) {
    const lat = latMin + r * latStep;
    for (let c = 0; c < nLng; c++) {
      let lng = lngMin + c * lngStep;
      if (lng > 180) lng -= 360; // 경도 정규화
      else if (lng < -180) lng += 360;
      // 소수 둘째 자리(약 1km)로 줄인다. 긴 소수는 URL이 9천 자를 넘겨 요청이 실패한다.
      lats.push(Math.round(lat * 100) / 100);
      lngs.push(Math.round(lng * 100) / 100);
    }
  }

  const params = new URLSearchParams({
    latitude: lats.join(','),
    longitude: lngs.join(','),
    current: 'wind_speed_10m,wind_direction_10m',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`바람 데이터 조회 실패: ${res.status}`);

  const data: PointResponse[] = await res.json();
  const n = nLat * nLng;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = data[i]?.current;
    const speed = c?.wind_speed_10m ?? 0;
    const dir = ((c?.wind_direction_10m ?? 0) * Math.PI) / 180;
    // 기상학 풍향은 "불어오는 쪽" → 이동 벡터는 반대. u=동, v=북
    u[i] = -speed * Math.sin(dir);
    v[i] = -speed * Math.cos(dir);
  }
  return { nLat, nLng, latMin, lngMin, latStep, lngStep, global, u, v };
};

// view 없음 → 전지구 격자. view 있음 → 그 영역의 고밀도 격자(16×16).
export const fetchWindGrid = async (view?: View | null): Promise<WindGrid> => {
  if (!view) {
    return fetchGrid(G_LAT_MIN, -180, G_STEP, G_STEP, G_N_LAT, G_N_LNG, true);
  }

  const { halfLat, halfLng } = viewHalfSpan(view);
  const nSide = 16;
  const latMin = Math.max(-85, view.lat - halfLat);
  const latMax = Math.min(85, view.lat + halfLat);
  const latStep = (latMax - latMin) / (nSide - 1);
  const lngStep = (2 * halfLng) / (nSide - 1);
  return fetchGrid(latMin, view.lng - halfLng, latStep, lngStep, nSide, nSide, false);
};

// 위경도가 격자 안에 있는지 (국지 격자 밖의 입자는 바람 정보가 없어 멈추므로 재생성용)
export const isInGrid = (grid: WindGrid, lat: number, lng: number): boolean => {
  const fr = (lat - grid.latMin) / grid.latStep;
  if (fr < 0 || fr > grid.nLat - 1) return false;
  if (grid.global) return true;
  const flng = (((lng - grid.lngMin) % 360) + 360) % 360;
  return flng / grid.lngStep <= grid.nLng - 1;
};

// 임의 위경도에서 바람 벡터를 양선형 보간으로 샘플링 → { u, v, speed } (km/h)
export const sampleWind = (
  grid: WindGrid,
  lat: number,
  lng: number
): { u: number; v: number; speed: number } => {
  const { nLat, nLng, latMin, lngMin, latStep, lngStep, global, u, v } = grid;

  const fr = (lat - latMin) / latStep; // 실수 행(위도) 인덱스
  if (fr < 0 || fr > nLat - 1) return { u: 0, v: 0, speed: 0 };

  // 경도 차이를 0~360으로 정규화 (날짜변경선을 넘는 국지 격자도 처리)
  const flng = (((lng - lngMin) % 360) + 360) % 360;
  const fc = flng / lngStep;

  const r0 = Math.floor(fr);
  const r1 = Math.min(r0 + 1, nLat - 1);
  const tr = fr - r0;

  let c0: number, c1: number, tc: number;
  if (global) {
    const wrap = (c: number) => ((c % nLng) + nLng) % nLng;
    c0 = wrap(Math.floor(fc));
    c1 = wrap(c0 + 1);
    tc = fc - Math.floor(fc);
  } else {
    if (fc < 0 || fc > nLng - 1) return { u: 0, v: 0, speed: 0 };
    c0 = Math.floor(fc);
    c1 = Math.min(c0 + 1, nLng - 1);
    tc = fc - c0;
  }

  const i00 = r0 * nLng + c0;
  const i01 = r0 * nLng + c1;
  const i10 = r1 * nLng + c0;
  const i11 = r1 * nLng + c1;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const su = lerp(lerp(u[i00], u[i01], tc), lerp(u[i10], u[i11], tc), tr);
  const sv = lerp(lerp(v[i00], v[i01], tc), lerp(v[i10], v[i11], tc), tr);
  return { u: su, v: sv, speed: Math.hypot(su, sv) };
};
