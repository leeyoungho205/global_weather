// NASA GIBS(위성 영상 서비스) 공통 도구
// - WMTS: 지도 타일 (바닥 지구 사진에 사용)
// - WMS: 원하는 범위·크기로 한 장짜리 그림을 받음 (지구 전체 = 위도·경도 격자 그림)
//   3D 지구본에 바로 입힐 수 있는 "등장방형(가로=경도, 세로=위도)" 그림을 받을 수 있어 편리합니다.

export const GIBS_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';

// 지구 전체 그림 주소 만들기 (왼쪽 끝 = 경도 -180°, 위쪽 끝 = 위도 90°)
export const wmsGlobalUrl = (
  layers: string,
  { width, height, format = 'image/png', time }: { width: number; height: number; format?: string; time?: string },
): string => {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: layers,
    STYLES: '',
    CRS: 'EPSG:4326',
    BBOX: '-90,-180,90,180', // WMS 1.3.0 + EPSG:4326 은 (위도, 경도) 순서입니다
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: format,
    TRANSPARENT: 'true',
  });
  if (time) params.set('TIME', time);
  return `${GIBS_WMS}?${params}`;
};

const pad = (n: number) => String(n).padStart(2, '0');

// 2026-11-13T01:50:00Z 형식 (GIBS가 쓰는 시각 표기)
export const timeKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(
    date.getUTCMinutes(),
  )}:00Z`;

// 그림 받기 (시간이 너무 오래 걸리면 포기)
export const fetchBitmap = async (url: string, timeoutMs = 25000): Promise<ImageBitmap> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`그림 받기 실패: ${response.status}`);
    // GIBS는 잘못된 요청에도 200과 함께 XML 오류를 보낼 때가 있어 종류를 확인합니다
    const type = response.headers.get('content-type') || '';
    if (!type.startsWith('image/')) throw new Error(`그림이 아닌 응답: ${type}`);
    return await createImageBitmap(await response.blob());
  } finally {
    clearTimeout(timer);
  }
};

// 그림 → 픽셀 값 (가로 width, 세로 height 로 맞춰서)
export const bitmapToPixels = (bitmap: ImageBitmap, width: number, height: number): Uint8ClampedArray => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return ctx.getImageData(0, 0, width, height).data;
};

// 가장 최근 정지 위성 사진의 시각 알아내기
// (히마와리 타일 한 장을 'default'로 받으면 실제 시각을 헤더로 알려 줍니다)
export const latestSatelliteTime = async (): Promise<Date> => {
  const response = await fetch(
    `${GIBS_WMTS}/Himawari_AHI_Band3_Red_Visible_1km/default/default/GoogleMapsCompatible_Level7/0/0/0.png`,
  );
  const actual = response.headers.get('layer-time-actual');
  if (!response.ok || !actual) throw new Error('위성 사진 시각을 알 수 없습니다');
  return new Date(actual);
};
