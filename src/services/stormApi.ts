// 전 세계 활성 열대저기압(태풍/허리케인/사이클론 + 발달 가능 시스템) 데이터
//
// 공개된 공식 기관 데이터를 조합한다.
// - 현재 위치·풍속: 미 해군연구소(NRL) ATCF 파일 (전 해역, 발달 전 '인베스트' 포함)
// - 서태평양 경로·예보: 일본 기상청(JMA)
// - 대서양·동/중태평양 경로: 미국 허리케인센터(NHC) 베스트트랙
// NRL·NHC는 CORS를 허용하지 않아 /tcdata 프록시를 거친다 (개발=Vite, 운영=Vercel rewrite).

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Storm {
  id: string; // 예: 30W
  name: string; // 예: IN-FA, 인베스트는 94L
  isInvest: boolean; // 아직 이름이 없는 발달 가능 시스템
  lat: number;
  lng: number;
  windKt: number; // 최대 풍속(노트)
  windKmh: number;
  pressure: number | null; // 중심기압(hPa)
  observedAt: number; // 관측 시각(ms)
  track: LatLng[]; // 지나온 경로
  forecast: LatLng[]; // 예보 경로
}

const SECTOR_URL = '/tcdata/sector';
const JMA_BASE = 'https://www.jma.go.jp/bosai/typhoon/data';
const MAX_AGE_MS = 48 * 3_600_000; // 이보다 오래된 관측은 끝난 시스템으로 보고 제외

const KT_TO_KMH = 1.852;

// NRL 좌표 '37.7N', '152.0E' → 숫자
const parseCoord = (text: string): number => {
  const value = parseFloat(text);
  return /[SW]$/.test(text) ? -value : value;
};

// NRL 파일 한 줄: 30W IN-FA 261106 0000 37.7N 152.0E WPAC 55 987
export const parseSectorFile = (text: string, now = Date.now()): Storm[] => {
  const storms: Storm[] = [];
  for (const line of text.split('\n')) {
    const c = line.trim().split(/\s+/);
    if (c.length < 8) continue;
    const [id, rawName, date, time, lat, lng] = c;
    const observedAt = Date.UTC(
      2000 + Number(date.slice(0, 2)),
      Number(date.slice(2, 4)) - 1,
      Number(date.slice(4, 6)),
      Number(time.slice(0, 2)),
      Number(time.slice(2, 4))
    );
    if (!(now - observedAt <= MAX_AGE_MS)) continue;

    const windKt = Number(c[7]) || 0;
    const pressure = Number(c[8]);
    const isInvest = rawName === 'INVEST';
    storms.push({
      id,
      name: isInvest ? id : rawName,
      isInvest,
      lat: parseCoord(lat),
      lng: parseCoord(lng),
      windKt,
      windKmh: Math.round(windKt * KT_TO_KMH),
      pressure: pressure > 0 ? pressure : null,
      observedAt,
      track: [],
      forecast: [],
    });
  }
  return storms;
};

// ATCF 베스트트랙 → 경로. 같은 시각이 풍속 반경별로 여러 줄이라 시각당 한 점만 쓴다.
// 예: AL, 94, 2026110600,   , BEST,   0, 263N,  657W, ...
export const parseBestTrack = (text: string): LatLng[] => {
  const byTime = new Map<string, LatLng>();
  for (const line of text.split('\n')) {
    const c = line.split(',').map((s) => s.trim());
    if (c.length < 8 || !/^\d+[NS]$/.test(c[6]) || !/^\d+[EW]$/.test(c[7])) continue;
    byTime.set(c[2], {
      lat: (parseInt(c[6], 10) / 10) * (c[6].endsWith('S') ? -1 : 1),
      lng: (parseInt(c[7], 10) / 10) * (c[7].endsWith('W') ? -1 : 1),
    });
  }
  return [...byTime.values()];
};

// NHC 경로 (대서양·동/중태평양만 제공)
const fetchNhcTrack = async (storm: Storm): Promise<LatLng[]> => {
  const basin = { L: 'al', E: 'ep', C: 'cp' }[storm.id.slice(-1)];
  if (!basin) return [];
  const year = new Date(storm.observedAt).getUTCFullYear();
  const res = await fetch(`/tcdata/btk/b${basin}${storm.id.slice(0, -1)}${year}.dat`);
  return res.ok ? parseBestTrack(await res.text()) : [];
};

// 이름 비교용 정규화 (IN-FA ↔ In-fa)
const normalizeName = (name: string) => name.toUpperCase().replace(/[^A-Z]/g, '');
const toLatLng = ([lat, lng]: number[]): LatLng => ({ lat, lng });

interface JmaPart {
  advancedHours?: number;
  name?: { en?: string };
  track?: { preTyphoon?: number[][]; typhoon?: number[][] };
  position?: { deg?: number[] };
}

// JMA 태풍별 경로·예보를 이름으로 묶어 가져온다
const fetchJmaTracks = async (): Promise<Map<string, Pick<Storm, 'track' | 'forecast'>>> => {
  const result = new Map<string, Pick<Storm, 'track' | 'forecast'>>();
  const listRes = await fetch(`${JMA_BASE}/targetTc.json`);
  if (!listRes.ok) return result;
  const list: { tropicalCyclone: string }[] = await listRes.json();

  await Promise.all(
    list.map(async ({ tropicalCyclone: tc }) => {
      const [trackRes, specRes] = await Promise.all([
        fetch(`${JMA_BASE}/${tc}/forecast.json`),
        fetch(`${JMA_BASE}/${tc}/specifications.json`),
      ]);
      if (!trackRes.ok || !specRes.ok) return;
      const trackParts: JmaPart[] = await trackRes.json();
      const specParts: JmaPart[] = await specRes.json();

      const name = specParts[0]?.name?.en;
      if (!name) return;
      const past = trackParts.find((p) => p.track)?.track;
      result.set(normalizeName(name), {
        track: [...(past?.preTyphoon ?? []), ...(past?.typhoon ?? [])].map(toLatLng),
        forecast: specParts
          .filter((p) => (p.advancedHours ?? 0) > 0 && p.position?.deg)
          .map((p) => toLatLng(p.position!.deg!)),
      });
    })
  );
  return result;
};

// 활성 시스템 + 경로 가져오기. 경로 조회가 실패해도 현재 위치는 표시한다.
export const fetchActiveStorms = async (): Promise<Storm[]> => {
  const res = await fetch(SECTOR_URL);
  if (!res.ok) throw new Error(`태풍 데이터 조회 실패: ${res.status}`);
  const storms = parseSectorFile(await res.text());

  const jma = await fetchJmaTracks().catch(() => new Map<string, Pick<Storm, 'track' | 'forecast'>>());
  return Promise.all(
    storms.map(async (storm) => {
      const fromJma = jma.get(normalizeName(storm.name));
      if (fromJma) return { ...storm, ...fromJma };
      const track = await fetchNhcTrack(storm).catch(() => []);
      return { ...storm, track };
    })
  );
};

// 풍속(노트) → 강도 색상 (사피어-심프슨 등급 기준)
export const stormColor = (windKt: number): string => {
  if (windKt < 34) return '#60a5fa'; // 열대저압부 이하
  if (windKt < 64) return '#22c55e'; // 열대폭풍
  if (windKt < 96) return '#f59e0b'; // 1~2등급
  if (windKt < 113) return '#f97316'; // 3등급
  return '#ef4444'; // 4~5등급
};
