// 열대 저기압(태풍·허리케인·사이클론) 실제 데이터
// GDACS(유엔·EU 공동 재난 경보 시스템)의 진행 중인 열대 저기압 정보를 받아 옵니다.
const GDACS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtype=TC';

// 등급 기호 → 이름과 색 (TD: 열대 저압부, TS: 열대 폭풍, HU: 태풍급)
export const STAGES: Record<string, { label: string; color: string }> = {
  TD: { label: '열대 저압부', color: '#5ebaff' },
  TS: { label: '열대 폭풍', color: '#ffd60a' },
  HU: { label: '태풍', color: '#ff8a00' },
};

export interface TrackPoint {
  lat: number;
  lng: number;
  time: Date | null;
  stage: string;
  color: string;
}

export interface Storm {
  id: string;
  name: string;
  category: string; // 지금 등급 (한국어)
  rank: number; // 0 열대 저압부, 1 열대 폭풍, 2 태풍, 3 강한 태풍
  maxWind: string;
  south: boolean;
  updated: Date;
  report?: string;
  position: { lat: number; lng: number };
  past: TrackPoint[]; // 지나온 길 (마지막 = 지금 위치)
  forecast: TrackPoint[]; // 예상 진로
  cone: [number, number][][]; // 예상 범위 폴리곤 고리들 ([경도, 위도])
}

interface GdacsFeature {
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown> & {
    eventtype?: string;
    eventid?: number;
    iscurrent?: string | boolean;
    Class?: string;
    polygonlabel?: string;
  };
}

// 바다(분지)에 따라 부르는 이름이 다릅니다
const basinWord = (lat: number, lng: number) => {
  if (lat >= 0 && lng >= 100) return '태풍'; // 북서태평양
  if (lat >= 0 && lng <= -20) return '허리케인'; // 대서양·동태평양
  return '사이클론'; // 인도양·남반구
};

// "06/11 06:00 UTC" → Date (연도는 폭풍이 시작된 해)
const parsePointTime = (label: string | undefined, year: number) => {
  const m = /(\d{2})\/(\d{2}) (\d{2}):(\d{2})/.exec(label || '');
  return m ? new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1]), Number(m[3]), Number(m[4]))) : null;
};

const ringCenter = (ring: number[][]) => {
  let lat = 0;
  let lng = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return { lat: lat / ring.length, lng: lng / ring.length };
};

const classIndex = (cls: string) => Number(cls.split('_').pop());

const buildStorm = (features: GdacsFeature[]): Storm | null => {
  const head = features[0].properties as Record<string, string | number | Record<string, string>>;
  const year = Number(String(head.fromdate || '').slice(0, 4)) || new Date().getUTCFullYear();
  const updated = new Date(`${head.todate}Z`);

  // 경로 위의 점 (작은 원 모양 폴리곤으로 옵니다)
  const points = features
    .filter((f) => f.properties.Class?.startsWith('Point_Polygon_Point_'))
    .map((f) => ({
      index: classIndex(f.properties.Class!),
      time: parsePointTime(f.properties.polygonlabel, year),
      ...ringCenter((f.geometry.coordinates as number[][][])[0]),
    }))
    .sort((a, b) => a.index - b.index);
  if (!points.length) return null;

  // 선분(Line_Line_i: i번째 점 → i+1번째 점)의 등급
  const stageOf: Record<number, string> = {};
  for (const f of features) {
    if (f.properties.Class?.startsWith('Line_Line_')) stageOf[classIndex(f.properties.Class)] = String(f.properties.polygonlabel);
  }
  const track: TrackPoint[] = points.map((p, i) => {
    const stage = stageOf[i] || stageOf[i - 1] || 'TD';
    return { lat: p.lat, lng: p.lng, time: p.time, stage, color: (STAGES[stage] || STAGES.TD).color };
  });

  // 지금 위치 = 마지막 관측 시각 이전의 마지막 점
  let now = 0;
  track.forEach((p, i) => {
    if (p.time && p.time <= updated) now = i;
  });
  const position = track[now];
  const stage = stageOf[now - 1] || position.stage;

  const coneFeature = features.find((f) => f.properties.Class === 'Poly_Cones');
  let cone: [number, number][][] = [];
  if (coneFeature) {
    const g = coneFeature.geometry;
    const polys = (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) as [number, number][][][];
    cone = polys.map((poly) => poly[0]);
  }

  const severity = head.severitydata as Record<string, string> | undefined;
  const windMatch = /([\d.]+)\s*km\/h/.exec(severity?.severitytext || '');
  const maxWind = windMatch ? Math.round(Number(windMatch[1])) : null;
  const word = basinWord(position.lat, position.lng);
  const label = stage === 'HU' ? word : STAGES[stage]?.label || '열대 저기압';
  const urls = head.url as Record<string, string> | undefined;

  return {
    id: `gdacs-${head.eventid}`,
    name: `${label} ${String(head.eventname || head.name || '').replace(/-\d+$/, '')}`,
    category: label,
    rank: stage === 'TD' ? 0 : stage === 'TS' ? 1 : (maxWind ?? 0) >= 178 ? 3 : 2,
    maxWind: maxWind ? `${maxWind} km/h` : '—',
    south: position.lat < 0,
    updated,
    report: urls?.report,
    position: { lat: position.lat, lng: position.lng },
    past: track.slice(0, now + 1),
    forecast: track.slice(now + 1),
    cone,
  };
};

// 진행 중인 열대 저기압 목록
export const fetchStorms = async (): Promise<Storm[]> => {
  const response = await fetch(GDACS_URL);
  if (!response.ok) throw new Error(`열대 저기압 조회 실패: ${response.status}`);
  const data = (await response.json()) as { features?: GdacsFeature[] };
  const groups = new Map<number, GdacsFeature[]>();
  for (const f of data.features || []) {
    const p = f.properties;
    if (p.eventtype !== 'TC' || String(p.iscurrent) !== 'true' || p.eventid == null) continue;
    if (!groups.has(p.eventid)) groups.set(p.eventid, []);
    groups.get(p.eventid)!.push(f);
  }
  return [...groups.values()].map(buildStorm).filter((s): s is Storm => s !== null);
};
