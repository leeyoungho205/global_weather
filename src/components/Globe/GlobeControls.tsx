// 지구본 줌/내위치 컨트롤 버튼
import type { GlobeInstance } from 'globe.gl';
import { useMapStore } from '../../store/mapStore';

interface Props {
  globeRef: React.RefObject<GlobeInstance | undefined>;
}

const GlobeControls = ({ globeRef }: Props) => {
  const { setPointOfView, setSelectedLocation } = useMapStore();

  // 줌 인
  const handleZoomIn = () => {
    if (!globeRef.current) return;
    const pov = globeRef.current.pointOfView();
    const newAlt = Math.max(pov.altitude * 0.6, 0.1);
    globeRef.current.pointOfView({ ...pov, altitude: newAlt }, 400);
    setPointOfView({ lat: pov.lat, lng: pov.lng, altitude: newAlt });
  };

  // 줌 아웃
  const handleZoomOut = () => {
    if (!globeRef.current) return;
    const pov = globeRef.current.pointOfView();
    const newAlt = Math.min(pov.altitude * 1.6, 4.0);
    globeRef.current.pointOfView({ ...pov, altitude: newAlt }, 400);
    setPointOfView({ lat: pov.lat, lng: pov.lng, altitude: newAlt });
  };

  // 현재 위치로 이동
  const handleMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setSelectedLocation({ lat, lng });
        setPointOfView({ lat, lng, altitude: 1.0 });
        if (globeRef.current) {
          globeRef.current.pointOfView({ lat, lng, altitude: 1.0 }, 1000);
        }
      },
      () => {} // 실패 시 무시
    );
  };

  // 전체 보기로 리셋
  const handleReset = () => {
    if (!globeRef.current) return;
    globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 1000);
    setPointOfView({ lat: 20, lng: 0, altitude: 2.5 });
  };

  const btnClass = "w-10 h-10 flex items-center justify-center bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-full text-white hover:bg-white/10 transition-colors shadow-lg";

  return (
    <div className="flex flex-col gap-2">
      <button onClick={handleZoomIn} className={btnClass} aria-label="줌 인" title="줌 인">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
      </button>
      <button onClick={handleZoomOut} className={btnClass} aria-label="줌 아웃" title="줌 아웃">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      </button>
      <button onClick={handleMyLocation} className={btnClass} aria-label="내 위치" title="내 위치">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
      </button>
      <button onClick={handleReset} className={btnClass} aria-label="전체 보기" title="전체 보기">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
};

export default GlobeControls;
