// 3D 지구본 메인 컴포넌트 - CartoDB 라이트 지도 + 구름/레이더 오버레이
import { useRef, useCallback, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import Globe from 'react-globe.gl';
import type { GlobeInstance } from 'globe.gl';
import * as THREE from 'three';
import { useMapStore } from '../../store/mapStore';
import { useRadarFrames } from '../../hooks/useRadarFrames';
import { createCloudOverlay, createMercatorOverlay, stitchTiles, stitchTileWindow, computeTileWindow, createDarkOverlay, geoCloudTileUrl, CLOUD_MAX_ZOOM, GLOBAL_CLOUD_WINDOW, type MercWindow } from './overlays';

// 위성(VIIRS NOAA-20 트루컬러) 타일 URL — 오버레이 합성용
const satTileUrl = (z: number, x: number, y: number): string => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${yesterday}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`;
};
// 레이더(RainViewer) 타일 URL — 오버레이 합성용
const radarTileUrl = (host: string, path: string) => (z: number, x: number, y: number): string =>
  `${host}${path}/256/${z}/${x}/${y}/2/1_1.png`;
import { useWind } from '../../hooks/useWind';
import { GpuWind } from './gpuWind';
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
  // 현재 카메라 고도(줌) — 위치 마커 크기를 줌에 맞게 조절하는 데 사용
  const [povAltitude, setPovAltitude] = useState(2.5);
  // 보이는 영역(throttled) — 바람·강수량을 "지금 보는 곳"에 맞춰 고해상도로 로드
  const [view, setView] = useState(() => useMapStore.getState().pointOfView);
  const viewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(viewTimer.current), []);
  // 위성 구름 타일 새로고침 신호 (영상이 10분 간격으로 갱신됨)
  const [cloudTick, setCloudTick] = useState(() => Math.floor(Date.now() / 600_000));
  useEffect(() => {
    const timer = setInterval(() => setCloudTick(Math.floor(Date.now() / 600_000)), 60_000);
    return () => clearInterval(timer);
  }, []);
  const cloudRef = useRef<ReturnType<typeof createCloudOverlay> | null>(null);

  const { selectedLocation, setSelectedLocation, setPointOfView, baseLayer, showClouds, showRadar, showWind, showStorm } =
    useMapStore();
  const { currentFrame, host } = useRadarFrames();
  const radarRef = useRef<ReturnType<typeof createMercatorOverlay> | null>(null);
  const radarRequestSeq = useRef(0); // 레이더 텍스처 요청 순번
  const radarShownSeq = useRef(0); // 화면에 표시된 가장 새 요청 순번

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

  // 레이어/오버레이 변경 시 로딩 안내 초기화
  const layerKey = `${baseLayer}|${showClouds}|${showRadar}|${showWind}|${showStorm}`;
  useEffect(() => {
    setTilesReady(false);
    const timer = setTimeout(() => setTilesReady(true), 2500);
    return () => clearTimeout(timer);
  }, [layerKey]);

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

  // 베이스는 라디오(지도/위성), 오버레이는 독립 토글 → 자유롭게 조합
  const isSatellite = baseLayer === 'satellite';
  const isRadar = showRadar;   // 강수량
  const isWind = showWind;     // 바람
  const isStorm = showStorm;   // 태풍
  const isBase = showClouds;   // 구름 오버레이

  // 바람 레이어일 때만 바람 격자 로드(보이는 영역 기준 → 확대 시 국지 바람)
  const { windGrid } = useWind(isWind, view);
  // 태풍 레이어일 때만 활성 태풍 로드
  const { storms } = useStorms(isStorm);

  // 강수량(레이더) 국지 윈도우: 확대 시 보이는 영역만 고해상도 타일로.
  // 축소 상태면 null → 전지구 모드.
  const radarWindow = useMemo(() => computeTileWindow(view, 7), [view]); // RainViewer는 zoom 7까지
  // 구름 윈도우: 정지궤도 위성 타일(확대 시 보이는 영역만 zoom 6까지, 축소 시 전지구 zoom 3)
  const cloudWindow = useMemo(() => computeTileWindow(view, CLOUD_MAX_ZOOM) ?? GLOBAL_CLOUD_WINDOW, [view]);

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

    const cloud = createCloudOverlay(100.6);
    cloudRef.current = cloud;
    scene.add(cloud.mesh);
    return () => {
      scene.remove(cloud.mesh);
      cloud.dispose();
      cloudRef.current = null;
    };
  }, [sceneReady, isBase]);

  // 위성 구름 타일 합성 (타일이 없는 지역은 셰이더가 전지구 이미지로 대체)
  useEffect(() => {
    if (!sceneReady || !isBase || !cloudRef.current) return;
    let cancelled = false;
    stitchTileWindow(geoCloudTileUrl(cloudTick), cloudWindow).then((tex) => {
      if (cancelled || !cloudRef.current) { tex.dispose(); return; }
      cloudRef.current.setLocal(tex, cloudWindow.window);
    });
    return () => { cancelled = true; };
  }, [sceneReady, isBase, cloudWindow, cloudTick]);

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

  // 레이더 텍스처 갱신: 축소=전지구(zoom-2), 확대=보이는 영역만 고해상도 윈도우.
  // 프레임/호스트 변화 또는 보이는 영역(radarWindow) 변화 시 재합성.
  useEffect(() => {
    if (!isRadar || !currentFrame || !host || !radarRef.current) return;
    const urlFn = radarTileUrl(host, currentFrame.path);
    const seq = ++radarRequestSeq.current;
    // 재생 중 다음 프레임으로 넘어가도 받은 프레임을 버리지 않고 순서대로 표시한다.
    // (취소하면 첫 재생에서 그림이 멈춘다) 단, 더 새 요청이 이미 표시됐으면 건너뛴다.
    const show = (tex: THREE.Texture, win: MercWindow | null) => {
      if (seq < radarShownSeq.current || !radarRef.current) { tex.dispose(); return; }
      radarShownSeq.current = seq;
      radarRef.current.setTexture(tex, win);
    };
    if (radarWindow) {
      stitchTileWindow(urlFn, radarWindow).then((tex) => show(tex, radarWindow.window));
    } else {
      stitchTiles(urlFn, 2).then((tex) => show(tex, null));
    }
  }, [isRadar, currentFrame, host, radarWindow]);

  // ── 바람 레이어: 어두운 오버레이 + GPU Fade 파티클 흐름 ──
  useEffect(() => {
    if (!sceneReady || !globeRef.current || !isWind) return;
    const scene = (globeRef.current as unknown as { scene: () => THREE.Scene }).scene?.();
    if (!scene) return;

    const dark = createDarkOverlay(100.4);
    scene.add(dark.mesh);
    let wind: GpuWind | null = null;
    if (windGrid) {
      wind = new GpuWind(scene, globeRef.current, windGrid);
      wind.start();
    }
    return () => {
      scene.remove(dark.mesh);
      dark.dispose();
      wind?.dispose();
    };
  }, [sceneReady, isWind, windGrid]);

  // 현재 켜진 베이스/오버레이에 맞춰 로딩 안내 문구 구성
  const loadingLabel = isSatellite
    ? '🛰️ NASA 위성 이미지 로딩 중...'
    : isRadar
    ? '🌧️ 강수 레이더 불러오는 중...'
    : isWind
    ? '🌬️ 전지구 바람 데이터 불러오는 중...'
    : isStorm
    ? '🌀 전 세계 활성 태풍 불러오는 중...'
    : isBase
    ? '☁️ 실시간 구름 불러오는 중...'
    : '🗺️ 지도 불러오는 중...';

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
          // 고도가 의미있게 바뀔 때만 갱신(과도한 리렌더 방지) → 마커 크기 조절
          setPovAltitude((prev) => (Math.abs(prev - pov.altitude) > 0.03 ? pov.altitude : prev));
          // 카메라가 멈춘 뒤에만 데이터 영역 갱신 → 줌/이동 도중의 불필요한 타일·API 요청 방지
          clearTimeout(viewTimer.current);
          viewTimer.current = setTimeout(
            () => setView({ lat: pov.lat, lng: pov.lng, altitude: pov.altitude }),
            350
          );
        }}
        animateIn={!introShown}
        pointsData={markerData}
        pointLat="lat"
        pointLng="lng"
        pointColor={() => '#f59e0b'}
        pointAltitude={0.01}
        // 마커 크기를 카메라 고도에 비례 → 축소 시 적당히 보이고 확대 시 자연스럽게 작아짐
        pointRadius={Math.min(0.35, Math.max(0.035, povAltitude * 0.12))}
        pointResolution={16}
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
