// 3D 지구본 메인 컴포넌트
// 바닥: NASA Blue Marble (구름 없는 지구 사진)
// 덮개: 실제 위성 구름 / 레이더 / 기온·풍속 색 지도 / 고온 지점 (지구 전체 그림을 얇은 구에 입힘)
// 그 위: 나라 경계선, 위도/경도 격자, 태풍 경로·예상 범위·아이콘, 도시 이름, 측정 선, 선택한 위치 표시
// 어떤 것을 보여 줄지는 스토어(useMapStore)의 지도 종류·오버레이 값을 따릅니다.
import { useRef, useCallback, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import Globe from 'react-globe.gl';
import type { GlobeInstance } from 'globe.gl';
import { MeshBasicMaterial } from 'three';
import type * as THREE from 'three';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import countriesUrl from 'world-atlas/countries-110m.json?url';
import { useMapStore } from '../../store/mapStore';
import { GIBS_WMTS } from '../../services/gibs';
import { STAGES, type Storm } from '../../services/stormsApi';
import { buildFieldCanvas } from '../../services/weatherGrid';
import { useClouds, useFires, useRadar, useSelectedTime, useStorms, useWeatherGrid } from '../../hooks/useLiveData';
import { cities, countries, type CityLabel, type Place } from '../../data/places';
import type { LatLng } from '../../utils/format';
import { createOverlay, disposeOverlay, setOverlayImage } from './overlay';
import { WindParticles } from './windParticles';

// ── 바닥 지구 사진: NASA Blue Marble 타일 (8단계까지) ──────────────────────
const blueMarbleTileUrl = (x: number, y: number, level: number): string =>
  `${GIBS_WMTS}/BlueMarble_NextGeneration/default/default/GoogleMapsCompatible_Level8/${level}/${y}/${x}.jpeg`;

// 나라 경계선은 선만 그리고 면은 그리지 않습니다.
// (투명한 면이라도 깊이 정보를 남겨 아래의 구름·기온 덮개를 얼룩덜룩하게 가리기 때문)
const HIDDEN_MATERIAL = new MeshBasicMaterial({ visible: false });

// 덮개 이름과 높이 (아래 → 위 순서로 그려집니다)
const OVERLAYS = [
  { name: 'field', altitude: 0.004, order: 1 },
  { name: 'clouds', altitude: 0.007, order: 2 },
  { name: 'radar', altitude: 0.009, order: 3 },
  { name: 'fires', altitude: 0.011, order: 4 },
  { name: 'cones', altitude: 0.012, order: 5 },
] as const;
type OverlayName = (typeof OVERLAYS)[number]['name'];

// 지구본에 그릴 선·면 자료의 공통 모양
interface PathDatum { points: [number, number][]; color: string; forecast: boolean; stroke?: number }
interface PolygonDatum { kind: 'border'; geometry: GeoJSON.Geometry }
interface PointDatum { lat: number; lng: number; color: string; radius: number }
// 지구본 위 HTML 요소: 태풍 아이콘 또는 도시·나라 이름
type HtmlDatum = { type: 'storm'; storm: Storm; lat: number; lng: number } | { type: 'label'; label: CityLabel; lat: number; lng: number };

// 카메라 높이 → 2D 지도의 확대 단계쯤 (도시 이름을 언제부터 보여 줄지 정할 때 씁니다)
const zoomOfAltitude = (altitude: number) => Math.log2(2.6 / Math.max(altitude, 0.05)) + 3;

// 위도/경도 격자 (30°마다). 선이 지구 곡면을 따라가도록 점을 촘촘히 찍습니다
const GRATICULE: PathDatum[] = [
  ...[-60, -30, 0, 30, 60].map((lat) => ({
    points: Array.from({ length: 73 }, (_, i) => [lat, -180 + i * 5] as [number, number]),
    color: 'rgba(255,255,255,0.35)',
    forecast: false,
    stroke: 0.6,
  })),
  ...Array.from({ length: 12 }, (_, k) => -180 + k * 30).map((lng) => ({
    points: Array.from({ length: 35 }, (_, i) => [-85 + i * 5, lng] as [number, number]),
    color: 'rgba(255,255,255,0.35)',
    forecast: false,
    stroke: 0.6,
  })),
];

// 두 점 사이를 지구 곡면을 따라(대권) 잇는 점들 — 측정 선이 땅속으로 파고들지 않게
const greatCircle = (a: LatLng, b: LatLng): [number, number][] => {
  const toRad = Math.PI / 180;
  const v = (p: LatLng) => [Math.cos(p.lat * toRad) * Math.cos(p.lng * toRad), Math.cos(p.lat * toRad) * Math.sin(p.lng * toRad), Math.sin(p.lat * toRad)];
  const [x1, y1, z1] = v(a);
  const [x2, y2, z2] = v(b);
  const angle = Math.acos(Math.min(1, Math.max(-1, x1 * x2 + y1 * y2 + z1 * z2)));
  const steps = Math.max(2, Math.ceil(angle / toRad / 2));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const s1 = angle ? Math.sin((1 - t) * angle) / Math.sin(angle) : 1 - t;
    const s2 = angle ? Math.sin(t * angle) / Math.sin(angle) : t;
    const x = s1 * x1 + s2 * x2;
    const y = s1 * y1 + s2 * y2;
    const z = s1 * z1 + s2 * z2;
    return [Math.atan2(z, Math.hypot(x, y)) / toRad, Math.atan2(y, x) / toRad];
  });
};

interface GlobeViewProps {
  onGlobeClick: (point: LatLng) => void;
  onStormClick: (storm: Storm) => void;
  onPlaceClick: (place: Place) => void;
}

// 태풍 예상 범위 → 지구 전체 그림. 경도 180°를 넘는 모양도 끊기지 않게 좌우로 한 번씩 더 그립니다
const buildConeCanvas = (storms: Storm[]): HTMLCanvasElement | null => {
  const rings = storms.flatMap((s) => s.cone);
  if (!rings.length) return null;
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(205, 210, 218, 0.4)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1.5;
  for (const ring of rings) {
    // 경도가 갑자기 360° 가까이 뛰면 이어 붙입니다
    let prev = ring[0][0];
    const pts = ring.map(([lng, lat]) => {
      while (lng - prev > 180) lng -= 360;
      while (lng - prev < -180) lng += 360;
      prev = lng;
      return [((lng + 180) / 360) * W, ((90 - lat) / 180) * H];
    });
    for (const shift of [-W, 0, W]) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + shift, y) : ctx.moveTo(x + shift, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  return canvas;
};

const GlobeView = forwardRef<GlobeInstance | undefined, GlobeViewProps>(({ onGlobeClick, onStormClick, onPlaceClick }, ref) => {
  const globeRef = useRef<GlobeInstance | undefined>(undefined);
  const overlayMeshes = useRef<Partial<Record<OverlayName, THREE.Mesh>>>({});
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [globeReady, setGlobeReady] = useState(false);
  const [borders, setBorders] = useState<PolygonDatum[]>([]);

  const activeLayer = useMapStore((s) => s.activeLayer);
  const overlays = useMapStore((s) => s.overlays);
  const marker = useMapStore((s) => s.marker);
  const selectedPlace = useMapStore((s) => s.selectedPlace);
  const measure = useMapStore((s) => s.measure);
  const setView = useMapStore((s) => s.setView);
  // 도시 이름은 확대 단계가 0.5씩 바뀔 때만 다시 고릅니다 (매 프레임 다시 그리지 않도록)
  const labelZoom = useMapStore((s) => Math.round(zoomOfAltitude(s.view.altitude) * 2) / 2);

  useImperativeHandle(ref, () => globeRef.current);

  // ── 무엇을 보여 줄지 ──
  const isField = activeLayer === 'temperature' || activeLayer === 'wind';
  const showClouds = overlays.clouds && !isField; // 구름: 위성·레이더 지도에서
  const showRadar = activeLayer === 'radar' || overlays.radar; // 레이더(RainViewer): 레이더 지도이거나 레이더 버튼이 켜져 있으면 어디서나
  const showWind = activeLayer === 'wind' || overlays.wind; // 바람 파티클: 바람 지도이거나 바람 버튼이 켜져 있으면

  // ── 실시간 자료 ──
  const time = useSelectedTime();
  const clouds = useClouds(time, showClouds);
  const radar = useRadar(time, showRadar);
  const fires = useFires(overlays.heat);
  const storms = useStorms();
  const grid = useWeatherGrid(isField || showWind);

  // 창 크기 감지
  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 나라 경계선 (world-atlas 1:1억1천만 축척)
  useEffect(() => {
    fetch(countriesUrl)
      .then((r) => r.json())
      .then((topo: Topology) => {
        const collection = feature(topo, topo.objects.countries as GeometryCollection);
        setBorders(collection.features.map((f) => ({ kind: 'border', geometry: f.geometry })));
      })
      .catch(() => setBorders([]));
  }, []);

  // 지구본이 준비되면: 카메라 위치 + 덮개 구 만들기
  // (바닥을 타일로 그리면 onGlobeReady 신호가 오지 않을 때가 있어, 1초 뒤에도 한 번 더 시도합니다. 두 번 실행되지는 않습니다)
  const handleGlobeReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe || sceneRef.current) return;
    const { pointOfView: start } = useMapStore.getState(); // 처음 한 번만 쓰는 값이라 스토어에서 바로 읽습니다
    globe.pointOfView({ lat: start.lat, lng: start.lng, altitude: start.altitude }, 0);
    // 기본 조명(주변광 + 햇빛)이 함께 켜져 있으면 사진이 1.6배쯤 밝아져 색이 바래 보입니다.
    // 실제 위성 사진 색을 그대로 보여 주려고 햇빛 조명을 끕니다 (주변광만으로 원래 밝기)
    for (const light of globe.lights()) if (light.type === 'DirectionalLight') light.intensity = 0;
    const scene = globe.scene();
    sceneRef.current = scene;
    for (const o of OVERLAYS) {
      const mesh = createOverlay(globe, `overlay-${o.name}`, o.altitude, o.order);
      scene.add(mesh);
      overlayMeshes.current[o.name] = mesh;
    }
    setGlobeReady(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(handleGlobeReady, 1000);
    return () => clearTimeout(timer);
  }, [handleGlobeReady]);

  // 컴포넌트가 사라질 때 덮개 정리
  useEffect(() => {
    const meshes = overlayMeshes.current;
    const sceneHolder = sceneRef;
    return () => {
      const scene = sceneHolder.current;
      if (!scene) return;
      for (const mesh of Object.values(meshes)) if (mesh) disposeOverlay(scene, mesh);
    };
  }, []);

  // 카메라가 움직이면 아래쪽 좌표 표시를 바꿉니다 (너무 자주 바꾸지 않도록 0.1초에 한 번)
  const lastViewUpdate = useRef(0);
  const handleZoom = useCallback(
    (pov: { lat: number; lng: number; altitude: number }) => {
      const now = performance.now();
      if (now - lastViewUpdate.current < 100) return;
      lastViewUpdate.current = now;
      setView({ lat: pov.lat, lng: pov.lng, altitude: pov.altitude });
    },
    [setView],
  );

  // ── 덮개에 그림 입히기 ──
  const fieldCanvas = useMemo(() => {
    if (!grid.data || !isField) return null;
    return buildFieldCanvas(grid.data, activeLayer);
  }, [grid.data, isField, activeLayer]);

  useEffect(() => {
    if (!globeReady) return;
    const m = overlayMeshes.current;
    if (m.field) setOverlayImage(m.field, fieldCanvas, 0.85);
    if (m.clouds) setOverlayImage(m.clouds, showClouds ? clouds.data?.canvas ?? null : null, 1);
    if (m.radar) setOverlayImage(m.radar, showRadar ? radar.canvas.data ?? null : null, 0.9);
    if (m.fires) setOverlayImage(m.fires, overlays.heat ? fires.data ?? null : null, 1);
  }, [globeReady, fieldCanvas, showClouds, clouds.data, showRadar, radar.canvas.data, overlays.heat, fires.data]);

  // ── 바람 파티클: 실제 바람대로 흐르는 입자 ──
  const windRef = useRef<WindParticles | null>(null);
  useEffect(() => {
    const scene = sceneRef.current;
    const globe = globeRef.current;
    if (!globeReady || !scene || !globe || !showWind || !grid.data) return;
    let particles = windRef.current;
    if (particles) particles.setGrid(grid.data);
    else {
      particles = new WindParticles(globe, grid.data);
      windRef.current = particles;
      scene.add(particles.mesh);
    }
    const active = particles;
    let raf = 0;
    const tick = () => {
      active.step();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // 바람 지도도 아니고 바람 버튼도 꺼졌으면 입자를 치웁니다
      const { activeLayer: layer, overlays: o } = useMapStore.getState();
      if (layer !== 'wind' && !o.wind) {
        scene.remove(active.mesh);
        active.dispose();
        windRef.current = null;
      }
    };
  }, [globeReady, showWind, grid.data]);

  // 지구본 클릭 → 위치 선택 (무엇을 할지는 App이 정합니다)
  const handleGlobeClick = useCallback((coords: { lat: number; lng: number }) => onGlobeClick({ lat: coords.lat, lng: coords.lng }), [onGlobeClick]);

  // ── 태풍: 경로 선(구간마다 등급 색), 예상 범위, 경로 점, 아이콘 ──
  const stormList = useMemo(() => (overlays.storms ? storms.data ?? [] : []), [overlays.storms, storms.data]);

  const stormPaths: PathDatum[] = useMemo(
    () =>
      stormList.flatMap((storm) => {
        const track = [...storm.past, ...storm.forecast];
        const now = storm.past.length - 1;
        return track.slice(1).map((p, i) => ({
          points: [
            [track[i].lat, track[i].lng],
            [p.lat, p.lng],
          ] as [number, number][],
          color: track[i].color,
          forecast: i >= now,
        }));
      }),
    [stormList],
  );

  // 측정 선 (넓이를 잴 때는 마지막 점과 첫 점도 잇습니다)
  const measurePaths: PathDatum[] = useMemo(() => {
    if (!measure || measure.points.length < 2) return [];
    const pts = measure.mode === 'area' && measure.points.length > 2 ? [...measure.points, measure.points[0]] : measure.points;
    return pts.slice(1).map((p, i) => ({ points: greatCircle(pts[i], p), color: '#ffffff', forecast: false, stroke: 1.6 }));
  }, [measure]);

  const paths = useMemo(
    () => [...(overlays.graticule ? GRATICULE : []), ...stormPaths, ...measurePaths],
    [overlays.graticule, stormPaths, measurePaths],
  );

  const polygons: PolygonDatum[] = useMemo(() => (overlays.lines ? borders : []), [overlays.lines, borders]);

  // 태풍 예상 범위(회색 원뿔)는 3D 폴리곤으로 그리면 복잡한 모양이 깨져 보여서,
  // 지구 전체 그림(등장방형)에 직접 칠한 뒤 덮개로 씌웁니다
  const coneCanvas = useMemo(() => buildConeCanvas(stormList), [stormList]);
  useEffect(() => {
    if (globeReady && overlayMeshes.current.cones) setOverlayImage(overlayMeshes.current.cones, coneCanvas, 1);
  }, [globeReady, coneCanvas]);

  const points: PointDatum[] = useMemo(
    () => [
      ...(marker ? [{ lat: marker.lat, lng: marker.lng, color: '#0a84ff', radius: 0.45 }] : []),
      ...(selectedPlace ? [{ lat: selectedPlace.lat, lng: selectedPlace.lng, color: '#ffffff', radius: 0.3 }] : []),
      ...(measure ? measure.points.map((p) => ({ lat: p.lat, lng: p.lng, color: '#ffffff', radius: 0.25 })) : []),
      ...stormList.flatMap((storm) =>
        [...storm.past.slice(0, -1), ...storm.forecast].map((p) => ({ lat: p.lat, lng: p.lng, color: p.color, radius: 0.22 })),
      ),
    ],
    [marker, selectedPlace, measure, stormList],
  );

  // ── HTML 요소: 태풍 아이콘 + 도시·나라 이름 ──
  const htmlData: HtmlDatum[] = useMemo(() => {
    const labels: HtmlDatum[] = overlays.labels
      ? [...countries, ...cities]
          .filter((c) => c.minZoom <= labelZoom)
          .map((label) => ({ type: 'label' as const, label, lat: label.lat, lng: label.lng }))
      : [];
    const stormIcons: HtmlDatum[] = stormList.map((storm) => ({ type: 'storm' as const, storm, lat: storm.position.lat, lng: storm.position.lng }));
    return [...labels, ...stormIcons];
  }, [overlays.labels, labelZoom, stormList]);

  const makeHtmlElement = useCallback(
    (d: object) => {
      const datum = d as HtmlDatum;
      if (datum.type === 'label') {
        // Globe View 2D 앱과 같은 도시 이름 모양 (점 + 글자)
        const { label } = datum;
        const el = document.createElement('div');
        el.className = `label ${label.kind}`;
        if (label.kind === 'city') {
          const anchor = document.createElement('span');
          anchor.className = 'anchor';
          el.appendChild(anchor);
        }
        const text = document.createElement('span');
        text.className = 'text';
        text.textContent = label.name;
        el.appendChild(text);
        if (label.kind === 'city') {
          el.addEventListener('click', (event) => {
            event.stopPropagation();
            onPlaceClick(label);
          });
        }
        return el;
      }
      const { storm } = datum;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `storm-icon rank${storm.rank}${storm.south ? ' south' : ''}`;
      el.title = storm.name;
      el.setAttribute('aria-label', storm.name);
      el.style.setProperty('--storm-color', STAGES[storm.rank === 0 ? 'TD' : storm.rank === 1 ? 'TS' : 'HU'].color);
      // 회전 애니메이션은 안쪽 svg에만 줍니다. 바깥 요소의 transform은 지구본 라이브러리가 위치를 정할 때 씁니다
      el.innerHTML = `<svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 4.5c-4.4 0-8.6 1.7-10.5 5.6 2.4-1.7 5.2-2.2 7.6-1.6A7 7 0 0 0 15 22c4.4 0 8.6-1.7 10.5-5.6-2.4 1.7-5.2 2.2-7.6 1.6A7 7 0 0 0 15 4.5Z"/><circle cx="15" cy="15" r="3.2"/></svg>`;
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onStormClick(storm);
      });
      return el;
    },
    [onPlaceClick, onStormClick],
  );

  // 로딩 안내
  const loadingLabel =
    showClouds && clouds.isFetching
      ? '위성 4대의 구름 사진을 합치는 중…'
      : showRadar && radar.canvas.isFetching
        ? '레이더(RainViewer) 불러오는 중…'
        : overlays.heat && fires.isFetching
          ? '고온 지점 불러오는 중…'
          : (isField || showWind) && grid.isFetching
            ? '전 세계 기온·바람 불러오는 중…'
            : null;

  // react-globe.gl 의 타입 정의에 없는 속성(타일 최대 단계)을 함께 넘기기 위한 묶음
  const extraProps = { globeTileEngineMaxLevel: 8 } as Record<string, unknown>;

  return (
    <div className="globe-wrap">
      <Globe
        ref={globeRef as React.MutableRefObject<GlobeInstance>}
        {...extraProps}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl={null}
        bumpImageUrl={null}
        globeTileEngineUrl={blueMarbleTileUrl}
        showAtmosphere={true}
        atmosphereColor="#4fa8e8"
        atmosphereAltitude={0.18}
        onGlobeReady={handleGlobeReady}
        onGlobeClick={handleGlobeClick}
        onZoom={handleZoom}
        animateIn={true}
        // 나라 경계선
        polygonsData={polygons}
        polygonGeoJsonGeometry="geometry"
        polygonCapMaterial={() => HIDDEN_MATERIAL}
        polygonSideMaterial={() => HIDDEN_MATERIAL}
        polygonStrokeColor={() => 'rgba(255,255,255,0.45)'}
        polygonAltitude={0.005}
        polygonsTransitionDuration={0}
        // 격자, 태풍 경로(지나온 길 = 실선, 예상 진로 = 점선), 측정 선
        pathsData={paths}
        pathPoints="points"
        pathPointLat={(p: [number, number]) => p[0]}
        pathPointLng={(p: [number, number]) => p[1]}
        pathPointAlt={0.013}
        pathColor={(d: object) => (d as PathDatum).color}
        pathStroke={(d: object) => (d as PathDatum).stroke ?? 2}
        pathDashLength={(d: object) => ((d as PathDatum).forecast ? 0.15 : 1)}
        pathDashGap={(d: object) => ((d as PathDatum).forecast ? 0.1 : 0)}
        pathTransitionDuration={0}
        // 내 위치, 고른 장소, 측정 점, 태풍 경로 위의 점
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointRadius="radius"
        pointAltitude={0.013}
        pointResolution={12}
        pointsTransitionDuration={0}
        // 태풍 아이콘 + 도시 이름
        htmlElementsData={htmlData}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={(d: object) => ((d as HtmlDatum).type === 'storm' ? 0.015 : 0.01)}
        htmlElement={makeHtmlElement}
        htmlTransitionDuration={0}
      />

      {loadingLabel && <div className="globe-loading">{loadingLabel}</div>}
    </div>
  );
});

GlobeView.displayName = 'GlobeView';
export default GlobeView;
