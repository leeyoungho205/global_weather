// 지구본과 화면(버튼·창)이 함께 쓰는 상태 저장소
// 버튼을 누르면 여기 값이 바뀌고, 지구본(GlobeView)은 그 값을 보고 그림을 바꿉니다.
import { create } from 'zustand';
import type { GlobePointOfView, LayerType, Overlays } from '../types/map';
import type { Storm } from '../services/stormsApi';
import type { Place } from '../data/places';
import type { LatLng } from '../utils/format';

// 시간: 최신 위성 사진에서 10분 단위로 최대 7일 전까지 거슬러 볼 수 있습니다
export const STEP_MINUTES = 10;
export const MAX_BACK_MINUTES = 7 * 1440;
// 재생 버튼: 최근 1시간(10분 간격 7장)을 차례로 보여 줍니다
export const PLAY_RANGE_MINUTES = 60;

export interface Settings {
  timeZone: 'local' | 'utc';
  timeFormat: 'hour12' | 'hour24';
  appearance: 'translucent' | 'opaque';
  units: 'metric' | 'imperial';
}

export interface Measure {
  mode: 'distance' | 'area';
  points: LatLng[];
}

interface MapState {
  // 처음 카메라 위치 (한반도 위에서 지구 전체 보기)
  pointOfView: GlobePointOfView;
  // 지금 카메라가 보는 곳 (아래쪽 좌표 표시용)
  view: GlobePointOfView;
  setView: (view: GlobePointOfView) => void;

  // 지도 종류와 오버레이
  activeLayer: LayerType;
  setActiveLayer: (layer: LayerType) => void;
  overlays: Overlays;
  setOverlay: (key: keyof Overlays, on: boolean) => void;

  // 시간: latestTime = 가장 최근 위성 사진 시각, frameOffset = 그보다 몇 분 전을 보는지 (0 또는 음수)
  latestTime: Date | null;
  setLatestTime: (time: Date) => void;
  frameOffset: number;
  setFrameOffset: (minutes: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;

  // 고른 장소(날씨 창) / 태풍(정보 창) / 내 위치 점
  selectedPlace: Place | null;
  setSelectedPlace: (place: Place | null) => void;
  selectedStorm: Storm | null;
  setSelectedStorm: (storm: Storm | null) => void;
  marker: LatLng | null;
  setMarker: (point: LatLng | null) => void;

  // 거리·넓이 재기
  measure: Measure | null;
  setMeasure: (measure: Measure | null) => void;

  settings: Settings;
  setSettings: (change: Partial<Settings>) => void;
}

export const useMapStore = create<MapState>((set) => ({
  pointOfView: { lat: 36.38, lng: 127.83, altitude: 2.2 },
  view: { lat: 36.38, lng: 127.83, altitude: 2.2 },
  setView: (view) => set({ view }),

  activeLayer: 'satellite',
  setActiveLayer: (layer) => set({ activeLayer: layer }),
  overlays: {
    radar: false,
    clouds: true,
    wind: false,
    heat: false,
    storms: true,
    labels: true,
    lines: true,
    graticule: false,
    crosshair: false,
  },
  setOverlay: (key, on) => set((s) => ({ overlays: { ...s.overlays, [key]: on } })),

  latestTime: null,
  setLatestTime: (time) => set({ latestTime: time }),
  frameOffset: 0,
  setFrameOffset: (minutes) => set({ frameOffset: Math.min(0, Math.max(-MAX_BACK_MINUTES, minutes)) }),
  isPlaying: false,
  setIsPlaying: (playing) => set({ isPlaying: playing }),

  // 장소 창과 태풍 창은 같은 자리를 쓰므로, 하나를 열면 다른 하나는 닫습니다
  selectedPlace: null,
  setSelectedPlace: (place) => set(place ? { selectedPlace: place, selectedStorm: null } : { selectedPlace: null }),
  selectedStorm: null,
  setSelectedStorm: (storm) => set(storm ? { selectedStorm: storm, selectedPlace: null } : { selectedStorm: null }),
  marker: null,
  setMarker: (point) => set({ marker: point }),

  measure: null,
  setMeasure: (measure) => set({ measure }),

  settings: { timeZone: 'local', timeFormat: 'hour24', appearance: 'translucent', units: 'metric' },
  setSettings: (change) => set((s) => ({ settings: { ...s.settings, ...change } })),
}));

// 지금 화면에 보여 줄 위성 사진 시각
export const selectedTimeOf = (latest: Date, offset: number): Date => new Date(latest.getTime() + offset * 60000);
