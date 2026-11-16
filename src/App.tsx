// 앱 전체: 3D 지구본 + Globe View 모양의 버튼·창들을 연결합니다
// 화면 배치·색·버튼은 Globe View(2D 앱)와 같고, 가운데 지도만 3D 지구본입니다.
import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { GlobeInstance } from 'globe.gl';
import { PLAY_RANGE_MINUTES, STEP_MINUTES, selectedTimeOf, useMapStore } from './store/mapStore';
import { useLatestTime, useStorms } from './hooks/useLiveData';
import type { Overlays } from './types/map';
import type { Place } from './data/places';
import type { Storm } from './services/stormsApi';
import { areaKm2, distanceKm, formatLat, formatLng, type LatLng } from './utils/format';
import { TopRightButtons, OverlayButtons, ZoomButtons, TitleButton, Footer, NetworkNotice, type PanelName } from './components/GlobeUI/MapControls';
import { Icon } from './components/GlobeUI/Icons';
import { HOTKEYS } from './components/GlobeUI/layers';
import {
  WelcomeDialog, LayersPanel, LayersDropdown, ClockPanel, SearchPanel, SettingsPanel, AboutPanel,
  OverlaysPanel, TitleMenu, WeatherPanel, StormPanel, MeasurePanel, Legend, HeatConsent, type TitleMenuKey,
} from './components/GlobeUI/Panels';

// Three.js가 들어 있는 지구본은 따로 불러와 첫 화면을 빨리 띄웁니다
const GlobeView = lazy(() => import('./components/Globe/GlobeView'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 2 } },
});

// ── 즐겨찾기 저장 (localStorage) ──
// 개인 정보 보호 모드 등에서는 저장소를 못 쓸 수 있으므로 항상 try/catch로 감쌉니다
const SAVED_KEY = 'globe-view-3d:saved-places';
const readSavedPlaces = (): Place[] => {
  try {
    const list = JSON.parse(window.localStorage.getItem(SAVED_KEY) || '[]');
    return Array.isArray(list) ? list.filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number') : [];
  } catch {
    return [];
  }
};
const writeSavedPlaces = (list: Place[]) => {
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    // 저장할 수 없으면 이번 방문 동안만 기억합니다
  }
};

// 아무 곳이나 눌렀을 때 그곳의 이름 (좌표)
const pointPlace = ({ lat, lng }: LatLng, name?: string): Place => ({
  key: `pt:${lat.toFixed(3)},${lng.toFixed(3)}`,
  name: name ?? `${formatLat(lat)} ${formatLng(lng)}`,
  lat,
  lng,
});

const AppContent = () => {
  const globeRef = useRef<GlobeInstance | undefined>(undefined);
  const client = useQueryClient();
  const {
    activeLayer, setActiveLayer, overlays, setOverlay, latestTime, frameOffset, setFrameOffset, isPlaying, setIsPlaying,
    selectedPlace, setSelectedPlace, selectedStorm, setSelectedStorm, setMarker, measure, setMeasure, settings, setSettings, view,
  } = useMapStore();

  const latest = useLatestTime();
  const storms = useStorms();

  const [welcome, setWelcome] = useState(true);
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [layersOpen, setLayersOpen] = useState(() => window.innerWidth >= 680);
  const [saved, setSaved] = useState<Place[]>(readSavedPlaces);
  const [locating, setLocating] = useState(false);
  const [decimal, setDecimal] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [heatAsk, setHeatAsk] = useState(false);
  const heatAccepted = useRef(false);
  const [startTime] = useState(() => new Date(Math.floor(Date.now() / 600000) * 600000));

  // 처음 로딩 화면(스플래시) 숨기기
  useEffect(() => {
    const timer = setTimeout(() => (window as Window & { __hideSplash?: () => void }).__hideSplash?.(), 600);
    return () => clearTimeout(timer);
  }, []);

  // 즐겨찾기가 바뀔 때마다 저장
  useEffect(() => writeSavedPlaces(saved), [saved]);

  // ── 인터넷 연결: 다시 연결되면 실패했던 자료를 모두 다시 받습니다 ──
  const retryNetwork = useCallback(() => client.invalidateQueries(), [client]);
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      retryNetwork();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [retryNetwork]);

  // ── 카메라 움직이기 ──
  const flyTo = useCallback((point: LatLng, altitude?: number) => {
    const globe = globeRef.current;
    if (!globe) return;
    const now = globe.pointOfView();
    globe.pointOfView({ lat: point.lat, lng: point.lng, altitude: altitude ?? Math.min(now.altitude, 1.2) }, 1000);
  }, []);

  const zoomBy = (direction: 1 | -1) => {
    const globe = globeRef.current;
    if (!globe) return;
    const now = globe.pointOfView();
    const altitude = Math.min(4, Math.max(0.12, now.altitude * (direction > 0 ? 0.6 : 1 / 0.6)));
    globe.pointOfView({ ...now, altitude }, 400);
  };

  // ── 장소·태풍 열기 ──
  const openPlace = useCallback(
    (place: Place, fly = true) => {
      setSelectedPlace(place);
      setPanel(null);
      setWelcome(false);
      if (fly) flyTo(place);
      document.title = `${place.name} 날씨 | Globe View 3D`;
    },
    [flyTo, setSelectedPlace],
  );

  const closePlace = () => {
    setSelectedPlace(null);
    document.title = 'Globe View 3D | 실시간 기상 지구본';
  };

  const openStorm = useCallback(
    (storm: Storm) => {
      setSelectedStorm(storm);
      setPanel(null);
      setWelcome(false);
      flyTo(storm.position, 1.2);
    },
    [flyTo, setSelectedStorm],
  );

  // ── 지구본 클릭: 측정 중이면 점 추가, 아니면 그곳 날씨 열기 ──
  const onGlobeClick = useCallback(
    (point: LatLng) => {
      const { measure: m } = useMapStore.getState();
      if (m) {
        setMeasure({ ...m, points: [...m.points, point] });
        return;
      }
      if (panel === 'title' || panel === 'overlays') {
        setPanel(null);
        return;
      }
      openPlace(pointPlace(point), false);
    },
    [panel, openPlace, setMeasure],
  );

  // ── 시간 애니메이션: 재생하면 최근 1시간의 구름이 차례로 지나갑니다 ──
  // (위성 4대의 사진을 합치는 데 몇 초 걸려서, 한 장에 2초씩 보여 줍니다. 처음 한 바퀴는 조금 늦을 수 있어요)
  useEffect(() => {
    if (!isPlaying) return;
    let offset = -PLAY_RANGE_MINUTES;
    setFrameOffset(offset);
    const timer = setInterval(() => {
      offset += STEP_MINUTES;
      if (offset > 0) offset = -PLAY_RANGE_MINUTES;
      setFrameOffset(offset);
    }, 2000);
    return () => clearInterval(timer);
  }, [isPlaying, setFrameOffset]);

  const stepTime = (minutes: number) => {
    setIsPlaying(false);
    setFrameOffset(minutes === 0 ? 0 : frameOffset + minutes);
  };

  // ── 현재 위치 ──
  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setWelcome(false);
        setPanel(null);
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMarker(point);
        flyTo(point, 0.6);
        openPlace(pointPlace(point, '현재 위치'), false);
      },
      () => setLocating(false),
      { timeout: 10000 },
    );
  };

  // ── 오버레이 켜고 끄기 (고온 지점은 처음 켤 때 안내 창을 먼저 보여 줍니다) ──
  const toggleOverlay = useCallback(
    (key: keyof Overlays) => {
      const on = useMapStore.getState().overlays[key];
      if (key === 'heat' && !on && !heatAccepted.current) {
        setHeatAsk(true);
        return;
      }
      setOverlay(key, !on);
    },
    [setOverlay],
  );

  const togglePanel = useCallback((name: PanelName) => {
    setWelcome(false);
    setPanel((current) => (current === name ? null : name));
  }, []);

  const startMeasure = (mode: 'distance' | 'area') => {
    setPanel(null);
    setMeasure(measure && measure.mode === mode ? null : { mode, points: [] });
  };

  const onTitleMenu = (key: TitleMenuKey) => {
    if (key === 'distance' || key === 'area') startMeasure(key);
    else if (key === 'share') {
      navigator.clipboard?.writeText(window.location.href);
      setPanel(null);
    } else setPanel(key);
  };

  // ── 키보드 단축키 (한 글자 키로 오버레이 켜고 끄기, / 검색, Esc 닫기) ──
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (event.key === 'Escape') {
        setPanel(null);
        setWelcome(false);
        useMapStore.getState().setMeasure(null);
      } else if (event.key === '/') {
        event.preventDefault();
        togglePanel('search');
      } else if (HOTKEYS[key]) {
        toggleOverlay(HOTKEYS[key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePanel, toggleOverlay]);

  // ── 측정 값 (거리 km / 넓이 km²) ──
  let measureValue = 0;
  if (measure) {
    if (measure.mode === 'area') measureValue = areaKm2(measure.points);
    else for (let i = 1; i < measure.points.length; i++) measureValue += distanceKm(measure.points[i - 1], measure.points[i]);
  }

  // ── <main>에 붙이는 상태 이름: CSS가 이것을 보고 무엇을 보여 줄지 정합니다 ──
  const sidePanel = panel === 'search' || panel === 'settings' || panel === 'about';
  const classes = [
    `layer-${activeLayer}`,
    settings.appearance === 'translucent' ? 'ui-blur ui-blur-dark' : 'ui-opaque',
    'ui-clock',
    welcome && 'ui-dialog-welcome',
    panel && `ui-${panel}`,
    sidePanel && 'ui-side',
    layersOpen && 'ui-layers',
    selectedPlace && 'ui-weather',
    selectedStorm && 'ui-storm',
    measure && 'ui-measure',
    isPlaying && 'ui-playing',
  ]
    .filter(Boolean)
    .join(' ');

  // 시계가 보여 줄 시각 (최신 시각을 아직 모르면 처음 열었을 때 시각을 10분 단위로)
  const clockTime = latestTime ? selectedTimeOf(latestTime, frameOffset) : startTime;
  const isSaved = !!selectedPlace && saved.some((p) => p.key === selectedPlace.key);

  return (
    <main className={classes}>
      <section id="map" aria-label="3D 지구본">
        <Suspense fallback={<div className="globe-loading">지구본 불러오는 중…</div>}>
          <GlobeView ref={globeRef} onGlobeClick={onGlobeClick} onStormClick={openStorm} onPlaceClick={(p) => openPlace(p, false)} />
        </Suspense>
      </section>
      {overlays.crosshair && <div className="crosshair" aria-hidden="true" />}

      <TitleButton onClick={() => togglePanel('title')} />
      <TitleMenu onSelect={onTitleMenu} />

      <LayersDropdown layer={activeLayer} onClick={() => setLayersOpen((o) => !o)} />
      <button type="button" className="round layers-fab" aria-label="실시간 지도, 예보 지도" onClick={() => setLayersOpen((o) => !o)}>
        <span className="icon">
          <Icon name={layersOpen ? 'close' : 'layers'} />
        </span>
      </button>
      <LayersPanel layer={activeLayer} onSelect={setActiveLayer} onCollapse={() => setLayersOpen(false)} />

      <TopRightButtons
        panel={panel}
        measure={measure?.mode}
        onToggle={togglePanel}
        onMeasure={startMeasure}
        onLocate={locate}
        locating={locating}
      />
      <OverlayButtons
        overlays={overlays}
        moreOpen={panel === 'overlays'}
        onToggleOverlay={toggleOverlay}
        onToggleMore={() => togglePanel('overlays')}
      />
      {panel === 'overlays' && <OverlaysPanel overlays={overlays} onToggle={toggleOverlay} />}
      <Legend layer={activeLayer} />
      <ZoomButtons onZoom={zoomBy} />

      <ClockPanel
        time={clockTime}
        settings={settings}
        playing={isPlaying}
        isLatest={frameOffset === 0}
        onPlay={() => setIsPlaying(!isPlaying)}
        onStep={stepTime}
      />

      <NetworkNotice online={online} serverOk={!latest.isError} onRetry={retryNetwork} />

      <Footer lat={view.lat} lng={view.lng} decimal={decimal} onToggleDecimal={() => setDecimal((d) => !d)} />

      {selectedPlace && (
        <WeatherPanel
          place={selectedPlace}
          units={settings.units}
          onClose={closePlace}
          saved={isSaved}
          onToggleSave={() =>
            setSaved((list) =>
              list.some((p) => p.key === selectedPlace.key) ? list.filter((p) => p.key !== selectedPlace.key) : [...list, selectedPlace],
            )
          }
        />
      )}
      {selectedStorm && <StormPanel storm={selectedStorm} onClose={() => setSelectedStorm(null)} />}

      {measure && (
        <MeasurePanel
          mode={measure.mode}
          value={measureValue}
          count={measure.points.length}
          miles={settings.units === 'imperial'}
          onCancel={() => setMeasure(null)}
          onUndo={() => setMeasure({ ...measure, points: measure.points.slice(0, -1) })}
          onDone={() => setMeasure(null)}
        />
      )}

      {panel === 'search' && (
        <SearchPanel
          onClose={() => setPanel(null)}
          onPick={(p) => openPlace(p)}
          onPickStorm={openStorm}
          storms={storms.data ?? []}
          stormStatus={storms.isError ? 'error' : storms.data ? 'ok' : 'loading'}
          savedPlaces={saved}
          onLocate={locate}
          locating={locating}
        />
      )}
      {panel === 'settings' && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setPanel(null)} />}
      {panel === 'about' && <AboutPanel onClose={() => setPanel(null)} />}

      <HeatConsent
        open={heatAsk}
        onAccept={() => {
          heatAccepted.current = true;
          setHeatAsk(false);
          setOverlay('heat', true);
        }}
        onCancel={() => setHeatAsk(false)}
      />

      {welcome && !panel && (
        <WelcomeDialog
          onClose={() => setWelcome(false)}
          onLocate={locate}
          onSearch={() => {
            setWelcome(false);
            setPanel('search');
          }}
          locating={locating}
        />
      )}
    </main>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppContent />
  </QueryClientProvider>
);

export default App;
