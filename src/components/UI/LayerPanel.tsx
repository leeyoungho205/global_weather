// zoom.earth 스타일 좌측 레이어 패널
// - '베이스 지도'(지도/위성) = 라디오(택1)
// - '오버레이'(구름/강수량/바람/태풍) = 토글(독립적으로 조합 가능)
import { useState } from 'react';
import { useMapStore } from '../../store/mapStore';
import type { BaseLayer } from '../../types/map';

// 베이스 레이어 선택지 (라디오)
interface BaseItem {
  type: BaseLayer;
  label: string;
  icon: string;
  desc: string;
}
const BASE: BaseItem[] = [
  { type: 'map', label: '지도', icon: '🗺️', desc: '기본 지도' },
  { type: 'satellite', label: '위성', icon: '🛰️', desc: '최신 기상 위성 이미지' },
];

// 오버레이 토글 선택지
type OverlayKey = 'showClouds' | 'showRadar' | 'showWind' | 'showStorm';
interface OverlayItem {
  key: OverlayKey;
  label: string;
  icon: string;
  desc: string;
}
const OVERLAY: OverlayItem[] = [
  { key: 'showClouds', label: '구름', icon: '☁️', desc: '실시간 전지구 구름' },
  { key: 'showRadar', label: '강수량', icon: '🌧️', desc: '강수 레이더' },
  { key: 'showWind', label: '바람', icon: '🌬️', desc: '전지구 바람 흐름' },
  { key: 'showStorm', label: '태풍', icon: '🌀', desc: '활성 태풍 추적' },
];

const LayerPanel = () => {
  const { baseLayer, setBaseLayer, showClouds, showRadar, showWind, showStorm, toggleOverlay } =
    useMapStore();
  const [open, setOpen] = useState(true);

  const overlayState: Record<OverlayKey, boolean> = {
    showClouds,
    showRadar,
    showWind,
    showStorm,
  };

  // 베이스 레이어 라디오 행
  const BaseRow = ({ item }: { item: BaseItem }) => {
    const active = baseLayer === item.type;
    return (
      <button
        onClick={() => setBaseLayer(item.type)}
        title={item.desc}
        className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left transition-all ${
          active
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
            : 'text-slate-300 hover:bg-white/10'
        }`}
      >
        <span className="text-lg w-6 text-center">{item.icon}</span>
        <span className="text-sm font-medium flex-1">{item.label}</span>
        {active && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
    );
  };

  // 오버레이 토글 행 (우측에 켜짐/꺼짐 스위치)
  const OverlayRow = ({ item }: { item: OverlayItem }) => {
    const on = overlayState[item.key];
    return (
      <button
        onClick={() => toggleOverlay(item.key)}
        title={item.desc}
        className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left transition-all ${
          on ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'
        }`}
      >
        <span className="text-lg w-6 text-center">{item.icon}</span>
        <span className="text-sm font-medium flex-1">{item.label}</span>
        {/* 토글 스위치 */}
        <span
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            on ? 'bg-blue-500' : 'bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              on ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </span>
      </button>
    );
  };

  return (
    <div className="w-52 rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden">
      {/* 헤더 (접기/펼치기) */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-4 py-3 text-white hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span>🗂️</span> 지도 레이어
        </span>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-2 pb-3 space-y-3">
          {/* 베이스 지도 (택1) */}
          <div>
            <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              베이스 지도
            </div>
            <div className="space-y-0.5">
              {BASE.map((item) => (
                <BaseRow key={item.type} item={item} />
              ))}
            </div>
          </div>

          {/* 오버레이 (여러 개 동시 선택 가능) */}
          <div>
            <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              오버레이
            </div>
            <div className="space-y-0.5">
              {OVERLAY.map((item) => (
                <OverlayRow key={item.key} item={item} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LayerPanel;
