// Global Weather 메인 앱 (zoom.earth 스타일 UI)
import { useEffect, useRef, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GlobeInstance } from 'globe.gl';
// Three.js가 포함된 GlobeView를 lazy 로딩으로 초기 번들 크기 감소
const GlobeView = lazy(() => import('./components/Globe/GlobeView'));
import GlobeControls from './components/Globe/GlobeControls';
import SearchBar from './components/Search/SearchBar';
import WeatherPanel from './components/Weather/WeatherPanel';
import LayerPanel from './components/UI/LayerPanel';
import TimeSlider from './components/UI/TimeSlider';
import { useGeolocation } from './hooks/useGeolocation';
import { useMapStore } from './store/mapStore';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 2 } },
});

const AppContent = () => {
  const globeRef = useRef<GlobeInstance | undefined>(undefined);
  const { setSelectedLocation, setPointOfView, showRadar } = useMapStore();
  const { location, isLoading: geoLoading } = useGeolocation();

  // 앱 마운트 직후 스플래시 숨기기
  useEffect(() => {
    const timer = setTimeout(() => {
      (window as Window & { __hideSplash?: () => void }).__hideSplash?.();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // 현재 위치 감지 후 지구본 이동
  useEffect(() => {
    if (!geoLoading && location) {
      setSelectedLocation(location);
      setPointOfView({ lat: location.lat, lng: location.lng, altitude: 1.5 });
      globeRef.current?.pointOfView(
        { lat: location.lat, lng: location.lng, altitude: 1.5 },
        1500
      );
    }
  }, [geoLoading, location, setSelectedLocation, setPointOfView]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* 3D 지구본 (전체 배경) */}
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent" />
          </div>
        }
      >
        <GlobeView ref={globeRef} />
      </Suspense>

      {/* ── 좌상단: 로고 + 레이어 패널 ── */}
      <div className="fixed top-4 left-4 z-40 flex flex-col gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-lg w-fit">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-base">🌍</div>
          <span className="text-white font-bold text-sm pr-1">Global Weather</span>
        </div>
        <LayerPanel />
      </div>

      {/* ── 우상단: 검색 ── */}
      <div className="fixed top-4 right-4 z-40 w-64">
        <SearchBar globeRef={globeRef} />
      </div>

      {/* ── 하단 중앙: 강수량(레이더) 타임라인 ── */}
      {showRadar && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
          <TimeSlider />
        </div>
      )}

      {/* ── 우하단: 지구본 컨트롤 ── */}
      <div className="fixed bottom-6 right-4 z-30">
        <GlobeControls globeRef={globeRef} />
      </div>

      {/* ── 날씨 정보 패널 (위치 선택 시) ── */}
      <WeatherPanel />

      {/* 초기 위치 감지 로딩 */}
      {geoLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent mx-auto mb-4" />
            <p className="text-slate-300">위치를 감지하고 있습니다...</p>
          </div>
        </div>
      )}
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppContent />
  </QueryClientProvider>
);

export default App;
