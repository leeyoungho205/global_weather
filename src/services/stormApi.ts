// GDACS 전 세계 활성 열대저기압(태풍/허리케인/사이클론) API
//
// GDACS(유럽위원회+UN)는 전 세계 활성 TC를 무료로 제공하며 CORS를 허용한다.
// - 목록: geteventlist/SEARCH?eventlist=TC → 각 폭풍의 현재 위치/이름/경보등급/최대풍속
// - 경로: polygons/getgeometry → 이동 경로(LineString) + 예보 콘(cone)

export interface Storm {
  id: number;
  episodeId: number;
  name: string; // 폭풍 이름 (예: MURASU-26)
  lat: number;
  lng: number;
  alert: 'Red' | 'Orange' | 'Green';
  windKmh: number; // 최대 풍속 (km/h)
  windText: string; // 등급 설명
  geometryUrl: string; // 경로 데이터 URL
  track: { lat: number; lng: number }[]; // 이동 경로 좌표 (나중에 채움)
}

// GDACS는 CORS를 허용하지 않으므로 /gdacs 프록시 경유 (dev=Vite proxy, prod=Vercel rewrite)
const GDACS_ABS = 'https://www.gdacs.org/gdacsapi';
const LIST_URL = '/gdacs/api/events/geteventlist/SEARCH?eventlist=TC';

// GDACS가 돌려주는 절대 URL을 프록시 상대경로로 변환
const toProxy = (url: string): string => url.replace(GDACS_ABS, '/gdacs');

// 활성 태풍 목록 가져오기
export const fetchActiveStorms = async (): Promise<Storm[]> => {
  const res = await fetch(LIST_URL);
  if (!res.ok) throw new Error(`태풍 데이터 조회 실패: ${res.status}`);
  const data = await res.json();
  const feats: unknown[] = data?.features ?? [];

  return feats.map((raw) => {
    const f = raw as {
      geometry: { coordinates: [number, number] };
      properties: Record<string, unknown>;
    };
    const p = f.properties;
    const sev = (p.severitydata as { severity?: number; severitytext?: string }) ?? {};
    const urls = (p.url as { geometry?: string }) ?? {};
    return {
      id: Number(p.eventid),
      episodeId: Number(p.episodeid),
      name: String(p.eventname ?? p.name ?? '폭풍'),
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      alert: (p.alertlevel as Storm['alert']) ?? 'Green',
      windKmh: Math.round(sev.severity ?? 0),
      windText: String(sev.severitytext ?? ''),
      geometryUrl: urls.geometry ? toProxy(urls.geometry) : '',
      track: [],
    };
  });
};

// 특정 폭풍의 이동 경로(LineString들)를 순서대로 이어 반환
export const fetchStormTrack = async (
  geometryUrl: string
): Promise<{ lat: number; lng: number }[]> => {
  if (!geometryUrl) return [];
  try {
    const res = await fetch(geometryUrl);
    if (!res.ok) return [];
    const data = await res.json();
    const feats: {
      geometry: { type: string; coordinates: [number, number][] };
      properties: Record<string, unknown>;
    }[] = data?.features ?? [];

    // Line_Line_0, 1, 2 ... 순서로 정렬해 경로를 이어붙임
    const lines = feats
      .filter((f) => f.geometry?.type === 'LineString')
      .map((f) => {
        const cls = String(f.properties?.Class ?? f.properties?.class ?? '');
        const m = cls.match(/(\d+)$/);
        return { order: m ? Number(m[1]) : 0, coords: f.geometry.coordinates };
      })
      .sort((a, b) => a.order - b.order);

    const path: { lat: number; lng: number }[] = [];
    for (const l of lines) {
      for (const [lng, lat] of l.coords) {
        path.push({ lat, lng });
      }
    }
    return path;
  } catch {
    return [];
  }
};

// 경보등급 → 색상
export const alertColor = (alert: Storm['alert']): string => {
  if (alert === 'Red') return '#ef4444';
  if (alert === 'Orange') return '#f59e0b';
  return '#22c55e';
};
