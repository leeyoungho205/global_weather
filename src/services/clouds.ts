// 전 세계 실제 구름 그림 만들기
// 정지 위성 3대 + 극궤도 위성 1대의 사진을 지구 전체 한 장(등장방형)으로 받아,
// 밝은 부분(구름)만 남겨 하얀 구름 그림(투명 배경)으로 합칩니다.
//  - 히마와리(동경 140.7°): 아시아·오세아니아
//  - GOES-East(서경 75.2°): 아메리카·대서양
//  - GOES-West(서경 137.2°): 동태평양
//  - VIIRS(NOAA-20, 하루 1장): 유럽·아프리카·극지방처럼 정지 위성이 잘 못 보는 곳
// 위성마다 "바로 아래에서 얼마나 멀리 떨어져 비스듬히 보이는지"에 따라 픽셀마다 비중을 정해 섞습니다.
import { bitmapToPixels, fetchBitmap, timeKey, wmsGlobalUrl } from './gibs';

export const CLOUD_WIDTH = 2048;
export const CLOUD_HEIGHT = 1024;

interface GeoSatellite {
  name: string;
  subLon: number; // 위성 바로 아래 경도
  visible: string; // 낮 사진 (가시광선)
  infrared: string; // 밤 사진 (적외선)
}

const GEO_SATELLITES: GeoSatellite[] = [
  { name: 'Himawari', subLon: 140.7, visible: 'Himawari_AHI_Band3_Red_Visible_1km', infrared: 'Himawari_AHI_Band13_Clean_Infrared' },
  { name: 'GOES-East', subLon: -75.2, visible: 'GOES-East_ABI_Band2_Red_Visible_1km', infrared: 'GOES-East_ABI_Band13_Clean_Infrared' },
  { name: 'GOES-West', subLon: -137.2, visible: 'GOES-West_ABI_Band2_Red_Visible_1km', infrared: 'GOES-West_ABI_Band13_Clean_Infrared' },
];
const POLAR_LAYER = 'VIIRS_NOAA20_CorrectedReflectance_TrueColor';

// 위성 바로 아래에서 이 각도 안쪽은 그 위성만, FAR 바깥은 쓰지 않습니다
const NEAR_DEG = 64;
const FAR_DEG = 77;
const DAY = 14; // 해가 이보다 높으면 낮 사진만
const NIGHT = -3; // 해가 이보다 낮으면 밤 사진만

const toRad = Math.PI / 180;
const smooth = (lo: number, hi: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

// 해의 적위(그날 해가 머리 위에 오는 위도)와 시각(UTC 시간)
const sunPosition = (date: Date) => {
  const day = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000;
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  return { declination, hours };
};

// 낮 사진: 밝을수록 구름. 해가 낮으면 사진이 어두우므로 조금(최대 1.7배) 밝게 보정
const visibleCloud = (r: number, g: number, b: number, elevation: number) => {
  const gain = Math.min(1.7, 1 / Math.max(0.35, Math.sin(Math.max(elevation, 0) * toRad)) ** 0.5);
  const v = ((r + g + b) / 765) * gain;
  return { alpha: smooth(0.16, 0.78, v) ** 1.15, v };
};
// 밤 사진(적외선): 차가울수록(높은 구름) 밝게 보입니다.
// 11월 대륙의 차가운 땅도 0.55~0.72쯤으로 꽤 밝아서, 그보다 확실히 차가운 곳부터 구름으로 칩니다
const infraredCloud = (r: number, g: number, b: number) => {
  const v = Math.max(r, g, b) / 255;
  return { alpha: smooth(0.72, 0.92, v), v };
};

// 그림에서 실제로 찍힌(투명하지 않은) 부분의 비율. 듬성듬성(16칸마다) 세어도 충분합니다
const coverageOf = (pixels: Uint8ClampedArray): number => {
  let filled = 0;
  let total = 0;
  for (let i = 3; i < pixels.length; i += 4 * 16) {
    total++;
    if (pixels[i] > 0) filled++;
  }
  return filled / total;
};
// 정지 위성 한 대는 지구 전체 그림의 약 30%를 찍습니다. 그 절반도 안 차 있으면 "사진 없음"으로 봅니다
const MIN_COVERAGE = 0.15;

// 정지 위성 사진 한 장 받기. 그 시각 사진이 없으면 10분씩 거슬러 (최대 30분 전까지) 대신 씁니다.
// 주의: GIBS는 사진이 없는 시각(빠진 시각이나 아직 처리 중인 최신 시각)에도 오류 대신
// "텅 빈 투명 그림"을 보내 줍니다. 그래서 받은 그림이 실제로 차 있는지 확인해야 합니다.
const loadGeoLayer = async (layer: string, time: Date): Promise<Uint8ClampedArray | null> => {
  for (let back = 0; back <= 3; back++) {
    const when = timeKey(new Date(time.getTime() - back * 600000));
    try {
      const bitmap = await fetchBitmap(wmsGlobalUrl(layer, { width: CLOUD_WIDTH, height: CLOUD_HEIGHT, time: when }));
      const pixels = bitmapToPixels(bitmap, CLOUD_WIDTH, CLOUD_HEIGHT);
      if (coverageOf(pixels) >= MIN_COVERAGE) return pixels;
    } catch {
      // 받지 못했으면 다음(더 이른) 시각으로 다시 시도
    }
  }
  return null;
};

const loadPolar = async (): Promise<Uint8ClampedArray | null> => {
  try {
    const bitmap = await fetchBitmap(
      wmsGlobalUrl(POLAR_LAYER, { width: CLOUD_WIDTH, height: CLOUD_HEIGHT, format: 'image/jpeg' }),
    );
    return bitmapToPixels(bitmap, CLOUD_WIDTH, CLOUD_HEIGHT);
  } catch {
    return null;
  }
};

export interface CloudResult {
  canvas: HTMLCanvasElement;
  time: Date;
  sources: string[]; // 실제로 쓴 위성 이름 (출처 표시용)
}

// time 시각의 전 세계 구름 그림 만들기
export const buildCloudCanvas = async (time: Date): Promise<CloudResult> => {
  const W = CLOUD_WIDTH;
  const H = CLOUD_HEIGHT;

  // 1) 사진 받기 (모두 동시에)
  const [geo, polar] = await Promise.all([
    Promise.all(
      GEO_SATELLITES.map(async (sat) => {
        const [vis, ir] = await Promise.all([loadGeoLayer(sat.visible, time), loadGeoLayer(sat.infrared, time)]);
        return { sat, vis, ir };
      }),
    ),
    loadPolar(),
  ]);
  const usable = geo.filter((g) => g.vis || g.ir);
  if (!usable.length && !polar) throw new Error('위성 사진을 하나도 받지 못했습니다');

  // 2) 줄(위도)·칸(경도)마다 미리 계산해 둘 값
  const { declination, hours } = sunPosition(time);
  const sinDec = Math.sin(declination * toRad);
  const cosDec = Math.cos(declination * toRad);
  const lonOf = (px: number) => -180 + ((px + 0.5) / W) * 360;
  const latOf = (py: number) => 90 - ((py + 0.5) / H) * 180;
  const cosHour = new Float32Array(W); // 각 경도의 시간각 cos
  for (let px = 0; px < W; px++) cosHour[px] = Math.cos(((hours - 12) * 15 + lonOf(px)) * toRad);
  // 각 위성이 각 경도를 얼마나 비스듬히 보는지 (cos(경도 차))
  const cosLonDiff = usable.map((g) => {
    const arr = new Float32Array(W);
    for (let px = 0; px < W; px++) arr[px] = Math.cos((lonOf(px) - g.sat.subLon) * toRad);
    return arr;
  });
  const cosNear = Math.cos(NEAR_DEG * toRad);
  const cosFar = Math.cos(FAR_DEG * toRad);

  // 3) 픽셀마다 위성별 구름 값을 비중대로 섞기
  const alphaMap = new Float32Array(W * H);
  const brightMap = new Float32Array(W * H);
  for (let py = 0; py < H; py++) {
    const lat = latOf(py);
    const sinLat = Math.sin(lat * toRad);
    const cosLat = Math.cos(lat * toRad);
    for (let px = 0; px < W; px++) {
      const p = py * W + px;
      const i = p * 4;
      const elevation = Math.asin(sinLat * sinDec + cosLat * cosDec * cosHour[px]) / toRad;
      const dayWeight = smooth(NIGHT, DAY, elevation);
      let sumW = 0;
      let sumA = 0;
      let sumV = 0;
      usable.forEach((s, k) => {
        const w = smooth(cosFar, cosNear, cosLat * cosLonDiff[k][px]);
        if (w <= 0) return;
        // 낮 사진과 밤 사진 중 "더 확실한 구름"을 씁니다.
        // (비율로 섞으면 해가 낮은 새벽·저녁 지역에서 어두운 낮 사진 때문에 구름이 사라지거나,
        //  차가운 땅이 적외선에서 엷은 막처럼 보이는 띠가 생깁니다)
        let a = -1;
        let v = 0;
        if (s.vis && dayWeight > 0 && s.vis[i + 3] > 0) {
          const c = visibleCloud(s.vis[i], s.vis[i + 1], s.vis[i + 2], elevation);
          a = c.alpha * dayWeight;
          v = c.v;
        }
        if (s.ir && s.ir[i + 3] > 0) {
          const c = infraredCloud(s.ir[i], s.ir[i + 1], s.ir[i + 2]);
          if (c.alpha > a) {
            a = c.alpha;
            v = Math.max(v, c.v);
          }
        }
        if (a < 0) return; // 이 위성 사진에 이 픽셀이 없음
        sumW += w;
        sumA += a * w;
        sumV += v * w;
      });
      // 정지 위성 비중이 모자라는 만큼 극궤도 사진으로 채우기.
      // 단, 아주 어두운 픽셀(극지방의 밤 = 찍히지 않은 곳)은 "맑음"이 아니라 "모름"이므로 건너뜁니다.
      // (건너뛰지 않으면 시베리아 위에 네모난 맑은 구역이 생깁니다)
      const polarSum = polar ? polar[i] + polar[i + 1] + polar[i + 2] : 0;
      if (polar && sumW < 1 && (polarSum > 60 || (sumW === 0 && polarSum > 0))) {
        const c = visibleCloud(polar[i], polar[i + 1], polar[i + 2], 90);
        const w = 1 - sumW;
        sumW += w;
        sumA += c.alpha * w;
        sumV += c.v * w;
      }
      if (sumW > 0) {
        alphaMap[p] = sumA / sumW;
        brightMap[p] = sumV / sumW;
      }
    }
  }

  // 4) 이웃 픽셀과 살짝 섞어(3×3) 계단 모양 가장자리를 부드럽게. 경도는 좌우가 이어지게 처리
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(W, H);
  const out = image.data;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      let a = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const y = Math.min(H - 1, Math.max(0, py + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const x = (px + dx + W) % W;
          a += alphaMap[y * W + x] * (dx || dy ? 1 : 4);
        }
      }
      const p = py * W + px;
      const bright = 168 + Math.min(1, brightMap[p]) * 84;
      out[p * 4] = bright - 5;
      out[p * 4 + 1] = bright - 2;
      out[p * 4 + 2] = bright;
      out[p * 4 + 3] = (a / 12) * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return {
    canvas,
    time,
    sources: [...usable.map((s) => s.sat.name), ...(polar ? ['VIIRS'] : [])],
  };
};
