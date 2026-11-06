// 맵/지구본 상태 관리 스토어
import { create } from 'zustand';
import type { Location, GlobePointOfView, BaseLayer } from '../types/map';

interface MapState {
  // 선택된 위치
  selectedLocation: Location | null;
  setSelectedLocation: (location: Location | null) => void;

  // 지구본 카메라 뷰
  pointOfView: GlobePointOfView;
  setPointOfView: (pov: GlobePointOfView) => void;

  // 베이스 레이어 (지도 / 위성 중 택1)
  baseLayer: BaseLayer;
  setBaseLayer: (layer: BaseLayer) => void;

  // 오버레이 토글 (독립적으로 켜고 끌 수 있음 = 조합 가능)
  showClouds: boolean;   // 구름
  showRadar: boolean;    // 강수량(레이더)
  showWind: boolean;     // 바람
  showStorm: boolean;    // 태풍
  toggleOverlay: (key: 'showClouds' | 'showRadar' | 'showWind' | 'showStorm') => void;

  // 레이더 타임스탬프 (Unix)
  radarTimestamp: number | null;
  setRadarTimestamp: (ts: number | null) => void;

  // 날씨 패널 열림 상태
  isPanelOpen: boolean;
  setIsPanelOpen: (open: boolean) => void;
}

export const useMapStore = create<MapState>((set) => ({
  // 초기값: 위치 미선택
  selectedLocation: null,
  setSelectedLocation: (location) => set({ selectedLocation: location, isPanelOpen: !!location }),

  // 초기값: 서울 위에서 지구본 전체 보기
  pointOfView: { lat: 37.5665, lng: 126.978, altitude: 2.5 },
  setPointOfView: (pov) => set({ pointOfView: pov }),

  // 초기값: 지도 베이스
  baseLayer: 'map',
  setBaseLayer: (layer) => set({ baseLayer: layer }),

  // 초기값: 구름 오버레이만 켜짐 (나머지는 꺼짐)
  showClouds: true,
  showRadar: false,
  showWind: false,
  showStorm: false,
  toggleOverlay: (key) => set((state) => ({ [key]: !state[key] })),

  // 레이더 시간
  radarTimestamp: null,
  setRadarTimestamp: (ts) => set({ radarTimestamp: ts }),

  // 패널 상태
  isPanelOpen: false,
  setIsPanelOpen: (open) => set({ isPanelOpen: open }),
}));
