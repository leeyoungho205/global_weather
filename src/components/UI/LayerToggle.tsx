// 레이어 토글 컴포넌트 (지도/위성/레이더)
import { useMapStore } from '../../store/mapStore';
import type { LayerType } from '../../types/map';

const layers: { type: LayerType; label: string; icon: string }[] = [
  { type: 'base', label: '지도', icon: '🗺️' },
  { type: 'satellite', label: '위성', icon: '🛰️' },
  { type: 'radar', label: '레이더', icon: '📡' },
  { type: 'wind', label: '바람', icon: '🌬️' },
  { type: 'storm', label: '태풍', icon: '🌀' },
];

const LayerToggle = () => {
  const { activeLayer, setActiveLayer } = useMapStore();

  return (
    <div className="flex gap-1 bg-slate-800/80 backdrop-blur-sm rounded-xl p-1 border border-slate-700/50">
      {layers.map(({ type, label, icon }) => (
        <button
          key={type}
          onClick={() => setActiveLayer(type)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeLayer === type
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
          aria-label={`${label} 레이어`}
        >
          <span className="mr-1">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
};

export default LayerToggle;
