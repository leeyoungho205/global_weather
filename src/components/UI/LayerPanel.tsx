// zoom.earth 스타일 좌측 레이어 패널
// - '실시간 지도'(위성/지도/레이더) + '오버레이'(바람/태풍) 섹션
// - 아이콘 + 라벨 행, 선택 시 파란 강조, 접이식(collapsible)
import { useState } from 'react';
import { useMapStore } from '../../store/mapStore';
import type { LayerType } from '../../types/map';

interface LayerItem {
  type: LayerType;
  label: string;
  icon: string;
  desc: string;
}

const LIVE: LayerItem[] = [
  { type: 'satellite', label: '위성', icon: '🛰️', desc: '최신 기상 위성 이미지' },
  { type: 'base', label: '지도', icon: '🗺️', desc: '기본 지도' },
  { type: 'radar', label: '레이더', icon: '📡', desc: '강수 레이더 + 구름' },
];

const OVERLAY: LayerItem[] = [
  { type: 'wind', label: '바람', icon: '🌬️', desc: '전지구 바람 흐름' },
  { type: 'storm', label: '태풍', icon: '🌀', desc: '활성 태풍 추적' },
];

const LayerPanel = () => {
  const { activeLayer, setActiveLayer } = useMapStore();
  const [open, setOpen] = useState(true);

  const Row = ({ item }: { item: LayerItem }) => {
    const active = activeLayer === item.type;
    return (
      <button
        onClick={() => setActiveLayer(item.type)}
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
          {/* 실시간 지도 */}
          <div>
            <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              실시간 지도
            </div>
            <div className="space-y-0.5">
              {LIVE.map((item) => (
                <Row key={item.type} item={item} />
              ))}
            </div>
          </div>

          {/* 오버레이 */}
          <div>
            <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              오버레이
            </div>
            <div className="space-y-0.5">
              {OVERLAY.map((item) => (
                <Row key={item.type} item={item} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LayerPanel;
