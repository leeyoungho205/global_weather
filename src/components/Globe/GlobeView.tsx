// 3D 지구본 메인 컴포넌트 - CartoDB 라이트 지도 + 구름/레이더 오버레이
import { useRef, useCallback, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import Globe from 'react-globe.gl';
import type { GlobeInstance } from 'globe.gl';
import * as THREE from 'three';
import { useMapStore } from '../../store/mapStore';
import { useRadarFrames } from '../../hooks/useRadarFrames';
import { createCloudOverlay, createMercatorOverlay, stitchTiles, createDarkOverlay } from './overlays';

// 위성(VIIRS NOAA-20 트루컬러) 타일 URL — 오버레이 합성용
const satTileUrl = (z: number, x: number, y: number): string => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${yesterday}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`;
};
// 레이더(RainViewer) 타일 URL — 오버레이 합성용
const radarTileUrl = (host: string, path: string) => (z: number, x: number, y: number): string =>
  `${host}${path}/256/${z}/${x}/${y}/2/1_1.png`;
import { useWind } from '../../hooks/useWind';
import { WindParticles } from './windParticles';
import { useStorms } from '../../hooks/useStorms';
import { alertColor, type Storm } from '../../services/stormApi';

// 태풍 아이콘(회전하는 🌀) + 이름 + 최대풍속 DOM 요소 생성 (globe.gl htmlElement용)
const makeStormEl = (d: object): HTMLElement => {
  const s = d as Storm;
  const color = alertColor(s.alert);
  const el = document.createElement('div');
  el.style.cssText =
    'pointer-events:none; text-align:center; transform:translate(-50%,-120%); font-family:system-ui,sans-serif;';
  const icon = document.createElement('div');
  icon.textContent = '🌀';
  icon.style.cssText = `font-size:26px; line-height:1; filter:drop-shadow(0 0 7px ${color});`;
  // 천천히 회전 (소용돌이 느낌)
  icon.animate(
    [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
    { duration: 3500, iterations: Infinity }
  );
  const label = document.createElement('div');
  label.innerHTML =
    `<div style="color:#fff;font-size:11px;font-weight:700;text-shadow:0 1px 3px #000;white-space:nowrap">${s.name}</div>` +
    `<div style="color:${color};font-size:10px;font-weight:600;text-shadow:0 1px 2px #000">${s.windKmh} km/h</div>`;
  el.appendChild(icon);
  el.appendChild(label);
  return el;
};

// ── 기본 지도 타일: Esri World Light Gray (API 키 불필요) ───────────────────────
// 이전 CartoDB light_all은 이제 API 키가 필요해져서 교체. 타일 순서는 {z}/{y}/{x}.
const getBaseTileUrl = (x: number, y: number, level: number): string => {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${level}/${y}/${x}`;
};

interface MarkerData { lat: number; lng: number; }

// 인트로 애니메이션은 최초 1회만 (레이어 전환 재마운트 시 생략)
let introShown = false;

const GlobeView = forwardRef<GlobeInstance | undefined>((_, ref) => {
  const globeRef = useRef<GlobeInstance | undefined>(undefined);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [tilesReady, setTilesReady] = useState(false);
  // Globe 씬 준비 완료 여부 (직접 씬 조작 전 확인용)
  const [sceneReady, setSceneReady] = useState(false);

  const { selectedLocation, setSelectedLocation, setPointOfView, activeLayer } =
    useMapStore();
  const { currentFrame, host } = useRadarFrames();
  const radarRef = useRef<ReturnType<typeof createMercatorOverlay> | null>(null);

  useImperativeHandle(ref, () => globeRef.current);

  // 창 크기 감지
  useEffect(() => {
    const handleResize = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 초기 카메라 + Globe 씬 준비 신호 (레이어 전환으로 재마운트돼도 현재 위치 복원)
  useEffect(() => {
    const delay = introShown ? 0 : 1000; // 첫 마운트만 인트로 애니메이션 대기
    const timer = setTimeout(() => {
      if (globeRef.current) {
        const pov = useMapStore.getState().pointOfView;
        globeRef.current.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: pov.altitude }, 0);
        setSceneReady(true);
        introShown = true;
      }
    }, delay);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 레이어 전환 시 로딩 안내 초기화
  useEffect(() => {
    setTilesReady(false);
    const timer = setTimeout(() => setTilesReady(true), 2500);
    return () => clearTimeout(timer);
  }, [activeLayer]);

  // 지구본 클릭 → 위치 선택
  const handleGlobeClick = useCallback(
    (coords: { lat: number; lng: number }, _event: MouseEvent) => {
      const { lat, lng } = coords;
      setSelectedLocation({ lat, lng });
      if (globeRef.current) {
        const currentPov = globeRef.current.pointOfView();
        const newAlt = Math.min(currentPov.altitude, 1.5);
        globeRef.current.pointOfView({ lat, lng, altitude: newAlt }, 800);
        setPointOfView({ lat, lng, altitude: newAlt });
      }
    },
    [setSelectedLocation, setPointOfView]
  );

  const isSatellite = activeLayer === 'satellite';
  const isRadar = activeLayer === 'radar';
  const isWind = activeLayer === 'wind';
  const isStorm = activeLayer === 'storm';
  const isBase = activeLayer === 'base'; // 지도 레이어(+실시간 구름 오버레이)

  // 바람 레이어일 때만 전지구 바람 격자 로드
  const { windGrid } = useWind(isWind);
  // 태풍 레이어일 때만 활성 태풍 로드
  const { storms } = useStorms(isStorm);

  // 태풍 경로(paths)와 위치(rings) 데이터
  const stormTracks = useMemo(
    () => storms.filter((s) => s.track.length > 1).map((s) => ({ coords: s.track, color: alertColor(s.alert) })),
    [storms]
  );

  const markerData: MarkerData[] = useMemo(
    () => (selectedLocation ? [{ lat: selectedLocation.lat, lng: selectedLocation.lng }] : []),
    [selectedLocation]
  );

  // ── 구름 오버레이 (지도 레이어): matteason 실시간 전지구 구름 ──────────────
  // 밝기를 알파로 변환해 "밝은 곳=구름, 어두운 곳=투명"으로 자연스럽게 렌더.
  useEffect(() => {
    if (!sceneReady || !globeRef.current || !isBase) return;
    const scene = (globeRef.current as unknown as { scene: () => THREE.Scene }).scene?.();
    if (!scene) return;

    const { mesh, dispose } = createCloudOverlay(100.6);
    scene.add(mesh);
    return () => {
      scene.remove(mesh);
      dispose();
    };
  }, [sceneReady, isBase]);

  // ── 위성 오버레이 (위성 레이어): VIIRS 트루컬러 타일 합성 (불투명) ──
  useEffect(() => {
    if (!sceneReady || !globeRef.current || !isSatellite) return;
    const scene = (globeRef.current as unknown as { scene: () => THREE.Scene }).scene?.();
    if (!scene) return;

    const sat = createMercatorOverlay(100.5, { useAlpha: false, opacity: 1 });
    scene.add(sat.mesh);
    let cancelled = false;
    stitchTiles(satTileUrl, 3).then((tex) => {
      if (cancelled) { tex.dispose(); return; }
      sat.setTexture(tex);
    });
    return () => {
      cancelled = true;
      scene.remove(sat.mesh);
      sat.dispose();
    };
  }, [sceneReady, isSatellite]);

  // ── 레이더 오버레이 (레이더 레이어): RainViewer, Mercator 보정 ──
  useEffect(() => {
    if (!sceneReady || !globeRef.current || !isRadar) return;
    const scene = (globeRef.current as unknown as { scene: () => THREE.Scene }).scene?.();
    if (!scene) return;

    const radar = createMercatorOverlay(100.8, { useAlpha: true, opacity: 0.9 });
    radarRef.current = radar;
    scene.add(radar.mesh);
    return () => {
      scene.remove(radar.mesh);
      radar.dispose();
      radarRef.current = null;
    };
  }, [sceneReady, isRadar]);

  // 레이더 현재 프레임이 바뀌면 텍스처 갱신 (zoom-2 16타일 합성)
  useEffect(() => {
    if (!isRadar || !currentFrame || !host || !radarRef.current) return;
    let cancelled = false;
    stitchTiles(radarTileUrl(host, currentFrame.path), 2).then((tex) => {
      if (cancelled || !radarRef.current) { tex.dispose(); return; }
      radarRef.current.setTexture(tex);
    });
    return () => { cancelled = true; };
  }, [isRadar, currentFrame, host]);

  // ── 바람 레이어: 어두운 오버레이 + nullschool 입자 흐름 ──
  useEffect(() => {
    if (!sceneReady || !globeRef.current || !isWind) return;
    const scene = (globeRef.current as unknown as { scene: () => THREE.Scene }).scene?.();
    if (!scene) return;

    const dark = createDarkOverlay(100.4);
    scene.add(dark.mesh);
    let particles: WindParticles | null = null;
    if (windGrid) {
      particles = new WindParticles(scene, globeRef.current, windGrid);
      particles.start();
    }
    return () => {
      scene.remove(dark.mesh);
      dark.dispose();
      particles?.dispose();
    };
  }, [sceneReady, isWind, windGrid]);

  const loadingLabel = isSatellite
    ? '🛰️ NASA 위성 이미지 로딩 중...'
    : isRadar
    ? '🌧️ 레이더 + 구름 로딩 중...'
    : isWind
    ? '🌬️ 전지구 바람 데이터 불러오는 중...'
    : isStorm
    ? '🌀 전 세계 활성 태풍 불러오는 중...'
    : '☁️ 구름 레이어 불러오는 중...';

  return (
    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, #0d1b3e 0%, #050d1a 100%)' }}>
      <Globe
        ref={globeRef as React.MutableRefObject<GlobeInstance>}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        bumpImageUrl={null}
        globeImageUrl={null}
        globeTileEngineUrl={getBaseTileUrl}
        showAtmosphere={true}
        atmosphereColor="#4fa8e8"
        atmosphereAltitude={0.18}
        onGlobeClick={handleGlobeClick}
        onZoom={(pov: { lat: number; lng: number; altitude: number }) => {
          // 인트로 애니메이션 중에는 위치를 저장하지 않음(엉뚱한 곳으로 튀는 것 방지)
          if (introShown) setPointOfView(pov);
        }}
        animateIn={!introShown}
        pointsData={markerData}
        pointLat="lat"
        pointLng="lng"
        pointColor={() => '#f59e0b'}
        pointAltitude={0.01}
        pointRadius={0.5}
        pointResolution={12}
        // ── 태풍 레이어: 위치 펄스(rings) + 이동 경로(paths) + 아이콘/이름(html) ──
        ringsData={isStorm ? storms : []}
        ringLat={(d: object) => (d as Storm).lat}
        ringLng={(d: object) => (d as Storm).lng}
        ringColor={(d: object) => () => alertColor((d as Storm).alert)}
        ringMaxRadius={5}
        ringPropagationSpeed={2}
        ringRepeatPeriod={700}
        ringAltitude={0.012}
        pathsData={isStorm ? stormTracks : []}
        pathPoints={(d: object) => (d as { coords: { lat: number; lng: number }[] }).coords}
        pathPointLat={(p: object) => (p as { lat: number }).lat}
        pathPointLng={(p: object) => (p as { lng: number }).lng}
        pathColor={(d: object) => (d as { color: string }).color}
        pathStroke={2}
        pathPointAlt={0.01}
        pathTransitionDuration={0}
        htmlElementsData={isStorm ? storms : []}
        htmlLat={(d: object) => (d as Storm).lat}
        htmlLng={(d: object) => (d as Storm).lng}
        htmlAltitude={0.02}
        htmlElement={makeStormEl}
      />

      {!tilesReady && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-slate-900/70 backdrop-blur-sm text-slate-300 text-xs px-3 py-1.5 rounded-full pointer-events-none">
          {loadingLabel}
        </div>
      )}
    </div>
  );
});

GlobeView.displayName = 'GlobeView';
export default GlobeView;
