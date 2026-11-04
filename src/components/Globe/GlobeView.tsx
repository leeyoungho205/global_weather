// 3D 지구본 메인 컴포넌트 - CartoDB 라이트 지도 + 구름/레이더 오버레이
import { useRef, useCallback, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import Globe from 'react-globe.gl';
import type { GlobeInstance } from 'globe.gl';
import * as THREE from 'three';
import { useMapStore } from '../../store/mapStore';
import { useRadarFrames } from '../../hooks/useRadarFrames';
import { getRadarTileUrl, getCloudTileUrl } from '../../services/radarApi';
import { useWind } from '../../hooks/useWind';
import { WindParticles } from './windParticles';

// 바람 레이어용 어두운 지구 텍스처 (key-free CDN) — 가산 블렌딩 입자가 빛나 보이도록
const DARK_EARTH = 'https://unpkg.com/three-globe/example/img/earth-dark.jpg';

// ── 기본 지도 타일: Esri World Light Gray (API 키 불필요) ───────────────────────
// 이전 CartoDB light_all은 이제 API 키가 필요해져서 교체. 타일 순서는 {z}/{y}/{x}.
const getBaseTileUrl = (x: number, y: number, level: number): string => {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${level}/${y}/${x}`;
};

// ── NASA GIBS 위성 타일 ──────────────────────────────────────────────────────
const getSatelliteTileUrl = (x: number, y: number, level: number): string => {
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${twoDaysAgo}/GoogleMapsCompatible_Level9/${level}/${y}/${x}.jpg`;
};

// Three.js 씬에서 이름으로 기존 메시 제거 + 메모리 해제
const removeMeshFromScene = (scene: THREE.Scene, name: string) => {
  const obj = scene.getObjectByName(name);
  if (!obj) return;
  scene.remove(obj);
  if (obj instanceof THREE.Mesh) {
    obj.geometry.dispose();
    const mat = obj.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
};

interface MarkerData { lat: number; lng: number; }

const GlobeView = forwardRef<GlobeInstance | undefined>((_, ref) => {
  const globeRef = useRef<GlobeInstance | undefined>(undefined);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [tilesReady, setTilesReady] = useState(false);
  // Globe 씬 준비 완료 여부 (직접 씬 조작 전 확인용)
  const [sceneReady, setSceneReady] = useState(false);

  const { selectedLocation, setSelectedLocation, pointOfView, setPointOfView, activeLayer } =
    useMapStore();
  const { currentFrame, host, latestCloudFrame } = useRadarFrames();

  useImperativeHandle(ref, () => globeRef.current);

  // 창 크기 감지
  useEffect(() => {
    const handleResize = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 초기 카메라 + Globe 씬 준비 신호
  useEffect(() => {
    // animateIn 완료 후 씬 조작 가능 (1초 대기)
    const timer = setTimeout(() => {
      if (globeRef.current) {
        globeRef.current.pointOfView(
          { lat: pointOfView.lat, lng: pointOfView.lng, altitude: pointOfView.altitude },
          0
        );
        setSceneReady(true);
      }
    }, 1000);
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

  // 바람 레이어일 때만 전지구 바람 격자 로드
  const { windGrid } = useWind(isWind);

  const tileEngineUrl = useMemo(() => {
    if (isSatellite) return getSatelliteTileUrl;
    return getBaseTileUrl;
  }, [isSatellite]);

  const markerData: MarkerData[] = useMemo(
    () => (selectedLocation ? [{ lat: selectedLocation.lat, lng: selectedLocation.lng }] : []),
    [selectedLocation]
  );

  // ── 구름 오버레이: Three.js 씬에 직접 추가 ─────────────────────────────────
  // customLayerData 방식 대신 scene()을 직접 조작 → 비동기 데이터 타이밍 문제 없음
  useEffect(() => {
    if (!sceneReady || !globeRef.current) return;
    const scene = (globeRef.current as unknown as { scene: () => THREE.Scene }).scene?.();
    if (!scene) return;

    // 기존 구름 메시 제거
    removeMeshFromScene(scene, 'cloud-overlay');

    // 위성 모드이거나 데이터 없으면 구름 숨김
    if (isSatellite || !latestCloudFrame || !host) return;

    // zoom=0 → 전 세계 1장 이미지 (256px, 구름은 흐릿하므로 해상도 충분)
    const cloudUrl = getCloudTileUrl(host, latestCloudFrame.path, 0, 0, 0);
    const loader = new THREE.TextureLoader();
    const texture = loader.load(cloudUrl);

    // Three.js 구체 UV는 경도 0°가 오른쪽 끝 → repeat.x=-1로 좌우 반전
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(-1, 1);
    texture.offset.set(1, 0);

    const geometry = new THREE.SphereGeometry(101.2, 64, 64);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.75,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'cloud-overlay';
    scene.add(mesh);

    return () => {
      removeMeshFromScene(scene, 'cloud-overlay');
    };
  }, [sceneReady, isSatellite, latestCloudFrame, host]);

  // ── 레이더 오버레이: Three.js 씬에 직접 추가 ───────────────────────────────
  useEffect(() => {
    if (!sceneReady || !globeRef.current) return;
    const scene = (globeRef.current as unknown as { scene: () => THREE.Scene }).scene?.();
    if (!scene) return;

    removeMeshFromScene(scene, 'radar-overlay');

    if (!isRadar || !currentFrame || !host) return;

    const radarUrl = getRadarTileUrl(host, currentFrame.path, 2, 2, 1);
    const loader = new THREE.TextureLoader();
    const texture = loader.load(radarUrl);

    const geometry = new THREE.SphereGeometry(101.5, 64, 64);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.6,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'radar-overlay';
    scene.add(mesh);

    return () => {
      removeMeshFromScene(scene, 'radar-overlay');
    };
  }, [sceneReady, isRadar, currentFrame, host]);

  // ── 바람 입자 흐름(nullschool 스타일): Three.js 씬에 입자 시스템 추가 ──────────
  useEffect(() => {
    if (!sceneReady || !globeRef.current || !isWind || !windGrid) return;
    const scene = (globeRef.current as unknown as { scene: () => THREE.Scene }).scene?.();
    if (!scene) return;

    const particles = new WindParticles(scene, globeRef.current, windGrid);
    particles.start();

    return () => particles.dispose();
  }, [sceneReady, isWind, windGrid]);

  const loadingLabel = isSatellite
    ? '🛰️ NASA 위성 이미지 로딩 중...'
    : isRadar
    ? '🌧️ 레이더 + 구름 로딩 중...'
    : isWind
    ? '🌬️ 전지구 바람 데이터 불러오는 중...'
    : '☁️ 구름 레이어 불러오는 중...';

  return (
    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, #0d1b3e 0%, #050d1a 100%)' }}>
      <Globe
        ref={globeRef as React.MutableRefObject<GlobeInstance>}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl={isWind ? DARK_EARTH : null}
        bumpImageUrl={null}
        globeTileEngineUrl={isWind ? undefined : tileEngineUrl}
        showAtmosphere={true}
        atmosphereColor="#4fa8e8"
        atmosphereAltitude={0.18}
        onGlobeClick={handleGlobeClick}
        animateIn={true}
        pointsData={markerData}
        pointLat="lat"
        pointLng="lng"
        pointColor={() => '#f59e0b'}
        pointAltitude={0.01}
        pointRadius={0.5}
        pointResolution={12}
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
