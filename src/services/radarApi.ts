// RainViewer 강수 레이더 API
// 레이더 사진은 메르카토르(웹 지도) 타일이라, 지구본에 입히려면 등장방형(위도·경도 격자) 그림으로 바꿔야 합니다.

// 레이더 프레임 (10분 간격, 최근 약 2시간)
export interface RadarFrame {
  time: number; // Unix 타임스탬프(초)
  path: string; // 타일 경로
}

export interface WeatherMapsResponse {
  version: string;
  generated: number;
  host: string;
  radar: {
    past: RadarFrame[];
    nowcast: RadarFrame[];
  };
}

// 레이더 프레임 목록 가져오기
export const fetchRadarFrames = async (): Promise<WeatherMapsResponse> => {
  const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
  if (!response.ok) throw new Error(`레이더 데이터 조회 실패: ${response.status}`);
  return response.json();
};

// 원하는 시각에 가장 가까운 레이더 프레임 (20분 넘게 차이 나면 없음)
export const pickRadarFrame = (frames: RadarFrame[], date: Date): RadarFrame | null => {
  let best: RadarFrame | null = null;
  for (const frame of frames) {
    if (!best || Math.abs(frame.time * 1000 - date.getTime()) < Math.abs(best.time * 1000 - date.getTime())) best = frame;
  }
  return best && Math.abs(best.time * 1000 - date.getTime()) <= 20 * 60000 ? best : null;
};

const ZOOM = 2; // 2단계 = 가로세로 4장씩 (512px 타일 → 2048px)
const TILE = 512;
const COLOR_SCHEME = 2; // 색 구성표 (2 = Universal Blue)
export const RADAR_WIDTH = 2048;
export const RADAR_HEIGHT = 1024;

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 캔버스에 그린 뒤에도 안전하게 쓸 수 있도록
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`레이더 타일 실패: ${url}`));
    img.src = url;
  });

// 레이더 한 프레임 → 지구 전체 등장방형 그림
export const buildRadarCanvas = async (host: string, frame: RadarFrame): Promise<HTMLCanvasElement> => {
  const n = 2 ** ZOOM;
  // 1) 메르카토르 타일 4×4장을 이어 붙이기
  const merc = document.createElement('canvas');
  merc.width = TILE * n;
  merc.height = TILE * n;
  const mctx = merc.getContext('2d')!;
  let loaded = 0;
  const jobs: Promise<void>[] = [];
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const url = `${host}${frame.path}/${TILE}/${ZOOM}/${x}/${y}/${COLOR_SCHEME}/1_1.png`;
      jobs.push(
        loadImage(url)
          .then((img) => {
            mctx.drawImage(img, x * TILE, y * TILE);
            loaded++;
          })
          .catch(() => undefined),
      );
    }
  }
  await Promise.all(jobs);
  if (!loaded) throw new Error('레이더 타일을 하나도 받지 못했습니다');

  // 2) 줄마다 해당 위도의 메르카토르 줄을 복사 → 등장방형으로 변환
  const out = document.createElement('canvas');
  out.width = RADAR_WIDTH;
  out.height = RADAR_HEIGHT;
  const ctx = out.getContext('2d')!;
  for (let py = 0; py < RADAR_HEIGHT; py++) {
    const lat = 90 - ((py + 0.5) / RADAR_HEIGHT) * 180;
    if (Math.abs(lat) > 85.05) continue; // 메르카토르 지도는 ±85° 밖을 담지 않습니다
    const phi = (lat * Math.PI) / 180;
    const my = ((1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2) * merc.height;
    ctx.drawImage(merc, 0, Math.floor(my), merc.width, 1, 0, py, RADAR_WIDTH, 1);
  }
  return out;
};
