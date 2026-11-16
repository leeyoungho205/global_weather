// 전 세계 기온·바람 격자 (Open-Meteo)
// 15° 간격 격자 점(264개)의 "지금 값"을 받아, 지구 전체 색 그림(등장방형)으로 만듭니다.
// Open-Meteo 무료 한도는 "1분에 지점 600개"라서, 10° 격자(612개)는 한 번에 한도를 넘습니다.
// 그래서 15° 간격으로 받고, 결과는 브라우저에 1시간 동안 저장해 둡니다.

const STEP = 15;
const LATS = Array.from({ length: 11 }, (_, j) => 75 - j * STEP); // 75 … -75
const LNGS = Array.from({ length: 24 }, (_, i) => -180 + i * STEP); // -180 … 165
const CACHE_KEY = 'global-earth:weather-grid-v2'; // v2: 풍향(동·북 성분) 추가
const KEEP_MS = 60 * 60000;

export interface WeatherGrid {
  time: string; // 값의 기준 시각 (UTC)
  temperature: number[]; // [위도 줄][경도 칸] 순서로 펼친 값 (°C)
  windSpeed: number[]; // km/h
  windU: number[]; // 바람이 동쪽으로 부는 성분 (km/h, 서쪽이면 음수)
  windV: number[]; // 바람이 북쪽으로 부는 성분 (km/h, 남쪽이면 음수)
}

const readCache = (): WeatherGrid | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (saved && Date.now() - saved.at < KEEP_MS) return saved.grid;
  } catch {
    // 저장소를 못 쓰는 환경이면 그냥 새로 받습니다
  }
  return null;
};

const writeCache = (grid: WeatherGrid) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), grid }));
  } catch {
    // 저장하지 못해도 화면에는 문제없습니다
  }
};

export const fetchWeatherGrid = async (): Promise<WeatherGrid> => {
  const cached = readCache();
  if (cached) return cached;
  const cells = LATS.flatMap((lat) => LNGS.map((lng) => ({ lat, lng })));
  const temperature: number[] = new Array(cells.length).fill(NaN);
  const windSpeed: number[] = new Array(cells.length).fill(NaN);
  const windU: number[] = new Array(cells.length).fill(NaN);
  const windV: number[] = new Array(cells.length).fill(NaN);
  let time = '';
  for (let start = 0; start < cells.length; start += 100) {
    const part = cells.slice(start, start + 100);
    const params = new URLSearchParams({
      latitude: part.map((c) => c.lat).join(','),
      longitude: part.map((c) => c.lng).join(','),
      current: 'temperature_2m,wind_speed_10m,wind_direction_10m',
      timezone: 'GMT',
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (response.status === 429) throw new Error('RATE_LIMIT'); // 1분 한도 초과 → 잠시 뒤 다시
    if (!response.ok) throw new Error(`기온·바람 격자 조회 실패: ${response.status}`);
    const data = await response.json();
    const list = Array.isArray(data) ? data : [data];
    type Current = { time: string; temperature_2m: number; wind_speed_10m: number; wind_direction_10m: number };
    list.forEach((item: { current: Current }, k: number) => {
      const c = item.current;
      temperature[start + k] = c.temperature_2m;
      windSpeed[start + k] = c.wind_speed_10m;
      // 풍향은 "불어오는 쪽"이므로, 바람이 가는 방향의 동쪽·북쪽 성분으로 바꿉니다
      const rad = (c.wind_direction_10m * Math.PI) / 180;
      windU[start + k] = -c.wind_speed_10m * Math.sin(rad);
      windV[start + k] = -c.wind_speed_10m * Math.cos(rad);
      time = c.time;
    });
  }
  const grid = { time, temperature, windSpeed, windU, windV };
  writeCache(grid);
  return grid;
};

// 아무 위치의 값 (주변 격자 4점을 섞어서). 경도는 좌우가 이어지고, 극지방은 가장 가까운 줄 값을 씁니다
export const sampleGrid = (values: number[], lat: number, lng: number): number => {
  const nLng = LNGS.length;
  const at = (j: number, i: number) => values[Math.min(LATS.length - 1, Math.max(0, j)) * nLng + ((i % nLng) + nLng) % nLng];
  const fj = (LATS[0] - lat) / STEP;
  const j = Math.floor(fj);
  const ty = fj - j;
  const fi = (lng + 180) / STEP;
  const i = Math.floor(fi);
  const tx = fi - i;
  return (at(j, i) * (1 - tx) + at(j, i + 1) * tx) * (1 - ty) + (at(j + 1, i) * (1 - tx) + at(j + 1, i + 1) * tx) * ty;
};

// ── 색 막대 ─────────────────────────────────────────
type Ramp = [number, [number, number, number]][];
export const RAMPS: Record<'temperature' | 'wind', Ramp> = {
  temperature: [
    [-40, [120, 40, 160]], [-20, [60, 70, 200]], [-5, [60, 160, 230]], [5, [70, 200, 170]],
    [15, [140, 210, 80]], [22, [240, 210, 60]], [30, [245, 130, 40]], [40, [200, 40, 50]],
  ],
  wind: [
    [0, [40, 60, 140]], [10, [40, 130, 190]], [20, [60, 190, 150]], [35, [200, 210, 70]],
    [55, [240, 120, 40]], [80, [200, 40, 120]],
  ],
};

const rampColor = (ramp: Ramp, value: number): [number, number, number] => {
  if (value <= ramp[0][0]) return ramp[0][1];
  for (let i = 1; i < ramp.length; i++) {
    if (value <= ramp[i][0]) {
      const t = (value - ramp[i - 1][0]) / (ramp[i][0] - ramp[i - 1][0]);
      const a = ramp[i - 1][1];
      const b = ramp[i][1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return ramp[ramp.length - 1][1];
};

// 격자 값 → 지구 전체 색 그림 (사이 값은 주변 4점을 섞어 부드럽게)
export const buildFieldCanvas = (grid: WeatherGrid, kind: 'temperature' | 'wind'): HTMLCanvasElement => {
  const values = kind === 'temperature' ? grid.temperature : grid.windSpeed;
  const W = 720;
  const H = 360;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(W, H);
  const nLng = LNGS.length;
  const at = (j: number, i: number) => values[Math.min(LATS.length - 1, Math.max(0, j)) * nLng + ((i % nLng) + nLng) % nLng];
  for (let py = 0; py < H; py++) {
    const lat = 90 - ((py + 0.5) / H) * 180;
    const fj = (LATS[0] - lat) / STEP; // 격자 줄 번호 (위가 0)
    const j = Math.floor(fj);
    const ty = fj - j;
    for (let px = 0; px < W; px++) {
      const lng = -180 + ((px + 0.5) / W) * 360;
      const fi = (lng + 180) / STEP;
      const i = Math.floor(fi);
      const tx = fi - i;
      const v =
        (at(j, i) * (1 - tx) + at(j, i + 1) * tx) * (1 - ty) + (at(j + 1, i) * (1 - tx) + at(j + 1, i + 1) * tx) * ty;
      if (Number.isNaN(v)) continue;
      const [r, g, b] = rampColor(RAMPS[kind], v);
      const k = (py * W + px) * 4;
      image.data[k] = r;
      image.data[k + 1] = g;
      image.data[k + 2] = b;
      // 극지방은 격자 점이 없어 색이 별 모양으로 모이므로 점점 투명하게 합니다
      image.data[k + 3] = 205 * (1 - Math.min(1, Math.max(0, (Math.abs(lat) - 70) / 15)));
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
};
