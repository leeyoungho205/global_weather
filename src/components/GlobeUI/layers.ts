// 지도 종류 목록과 오버레이 목록 (Globe View 2D 앱과 같은 순서·이름)
import type { LayerType, Overlays } from '../../types/map';
import type { IconName } from './Icons';

export interface LayerCategory {
  id: LayerType;
  label: string;
  icon: IconName;
}

// 실시간 지도: 실제 관측 사진
export const LIVE: LayerCategory[] = [
  { id: 'satellite', label: '위성', icon: 'satellite' },
  { id: 'radar', label: '레이더', icon: 'radar' },
];

// 예보 지도: Open-Meteo 예보 모델 값
export const FORECAST: LayerCategory[] = [
  { id: 'wind', label: '바람', icon: 'wind' },
  { id: 'temperature', label: '기온', icon: 'temperature' },
];

export const categoryOf = (layer: LayerType): LayerCategory =>
  [...LIVE, ...FORECAST].find((c) => c.id === layer) ?? LIVE[0];

// [키, 이름, 아이콘, 단축키]
export const OVERLAY_ITEMS: [keyof Overlays, string, IconName, string][] = [
  ['radar', '레이더 (RainViewer)', 'radar', 'R'],
  ['clouds', '구름', 'precipitation', 'O'],
  ['wind', '바람 애니메이션', 'wind', 'W'],
  ['heat', '고온 지점', 'heat', 'H'],
  ['storms', '열대 시스템', 'pressure', 'S'],
  ['labels', '지도 라벨', 'search', 'L'],
  ['lines', '경계선', 'distance', 'K'],
  ['graticule', '위도/경도 격자', 'area', 'G'],
  ['crosshair', '십자선', 'plus', 'X'],
];

// 키보드 한 글자 → 오버레이
export const HOTKEYS: Record<string, keyof Overlays> = Object.fromEntries(
  OVERLAY_ITEMS.map(([key, , , hotkey]) => [hotkey.toLowerCase(), key]),
);
