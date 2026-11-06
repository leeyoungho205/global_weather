// GPU Fade 방식 바람 파티클 (zoom.earth 기법을 3D 지구본에 적용)
//
// 원리:
// 1) 입자를 POINTS로 누적 렌더타깃(trailRT)에 가산 렌더
// 2) 매 프레임 trailRT를 살짝 어둡게(페이드) → 입자 자취가 부드러운 흐름 꼬리로 남음
// 3) trailRT를 카메라 정면 풀스크린 쿼드로 지구본 위에 가산 합성
// 4) 카메라가 움직이면(회전/줌) 화면공간 누적이 번지므로 trailRT 초기화
// 입자 위치는 CPU에서 갱신(궤적 지오메트리가 없어 가벼움 → 수만 개 가능).

import * as THREE from 'three';
import type { GlobeInstance } from 'globe.gl';
import { isInGrid, sampleWind, type WindGrid } from '../../services/windApi';

const DEG2RAD = Math.PI / 180;

// ── 튜닝 ───────────────────────────────────────────────
const PARTICLE_COUNT = 13000;
const LOCAL_PARTICLE_COUNT = 5000; // 국지 격자는 좁은 화면에 모이므로 적어도 충분히 조밀(지도 가림 방지)
const STEP_SCALE = 0.5; // 프레임당 이동 배율
const ALTITUDE = 0.006; // 표면에서 살짝 띄움
const POINT_SIZE = 1.1;
const FADE = 0.12; // 매 프레임 감쇠량(작을수록 꼬리 길어짐)
const INTENSITY = 0.7; // 가산 누적이 흰색으로 포화되지 않도록 낮춤(색/지도 보이게)
const MIN_AGE = 40;
const MAX_AGE = 120;
const LAT_LIMIT = 78; // 극 부근 뭉침 방지

// 풍속(km/h) → 색상
const speedToColor = (s: number, out: THREE.Color): THREE.Color => {
  const stops: [number, number, number, number][] = [
    [0, 0.45, 0.72, 1.0],
    [15, 0.3, 0.95, 0.95],
    [30, 0.45, 1.0, 0.5],
    [55, 1.0, 0.95, 0.35],
    [85, 1.0, 0.6, 0.2],
    [120, 1.0, 0.35, 0.35],
  ];
  if (s <= stops[0][0]) return out.setRGB(stops[0][1], stops[0][2], stops[0][3]);
  const last = stops[stops.length - 1];
  if (s >= last[0]) return out.setRGB(last[1], last[2], last[3]);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (s >= a[0] && s < b[0]) {
      const t = (s - a[0]) / (b[0] - a[0]);
      return out.setRGB(a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t);
    }
  }
  return out;
};

export class GpuWind {
  private scene: THREE.Scene;
  private globe: GlobeInstance;
  private grid: WindGrid;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.Camera;

  // 입자 상태 (CPU)
  private lat: Float32Array;
  private lng: Float32Array;
  private age: Float32Array;
  private maxAge: Float32Array;
  private count: number;

  // 렌더 대상
  private trailRT: THREE.WebGLRenderTarget;
  private pointsScene = new THREE.Scene();
  private points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;

  // 페이드(어둡게) 패스
  private fadeScene = new THREE.Scene();
  private fadeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // 합성 쿼드 (지구본 위에 trail 표시)
  private composite: THREE.Mesh;

  private _color = new THREE.Color();
  private running = false;
  private rafId = 0;
  private lastCamKey = '';
  private pov = { lat: 20, lng: 0, altitude: 2.5 };

  constructor(scene: THREE.Scene, globe: GlobeInstance, grid: WindGrid) {
    this.scene = scene;
    this.globe = globe;
    this.grid = grid;
    const g = globe as unknown as {
      renderer: () => THREE.WebGLRenderer;
      camera: () => THREE.Camera;
    };
    this.renderer = g.renderer();
    this.camera = g.camera();

    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    const dpr = this.renderer.getPixelRatio();
    const w = Math.max(2, Math.floor(size.x * dpr));
    const h = Math.max(2, Math.floor(size.y * dpr));

    this.trailRT = new THREE.WebGLRenderTarget(w, h, {
      depthBuffer: false,
      stencilBuffer: false,
      // 8비트는 페이드 값이 반올림으로 0까지 못 떨어져 잔상이 회색으로 쌓인다 → 부동소수 사용
      type: THREE.HalfFloatType,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
    });

    // 입자 초기화
    this.lat = new Float32Array(PARTICLE_COUNT);
    this.lng = new Float32Array(PARTICLE_COUNT);
    this.age = new Float32Array(PARTICLE_COUNT);
    this.maxAge = new Float32Array(PARTICLE_COUNT);
    this.positions = new Float32Array(PARTICLE_COUNT * 3);
    this.colors = new Float32Array(PARTICLE_COUNT * 3);
    this.updatePov();
    this.count = grid.global ? PARTICLE_COUNT : LOCAL_PARTICLE_COUNT;
    for (let i = 0; i < this.count; i++) this.spawn(i);

    // POINTS (가산 렌더, 뒷면 입자 discard)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setDrawRange(0, this.count);
    const pointMat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: POINT_SIZE * dpr } },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        uniform float uSize;
        varying vec3 vColor;
        varying float vFacing;
        void main() {
          vColor = color;
          vec3 wp = position;
          vec3 toCam = normalize(cameraPosition - wp);
          vFacing = dot(normalize(wp), toCam); // 지구 중심 원점 가정
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vFacing;
        void main() {
          if (vFacing < 0.08) discard; // 반대편 입자는 그리지 않음
          gl_FragColor = vec4(vColor, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, pointMat);
    this.points.frustumCulled = false;
    this.pointsScene.add(this.points);

    // 페이드 쿼드 (검은색 반투명 → 기존 자취를 서서히 어둡게)
    const fadeMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: FADE,
      depthTest: false,
      depthWrite: false,
    });
    this.fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat));

    // 합성 쿼드 (trailRT를 카메라 정면 풀스크린으로 가산 표시)
    const compMat = new THREE.MeshBasicMaterial({
      map: this.trailRT.texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.composite = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), compMat);
    this.composite.frustumCulled = false;
    this.composite.renderOrder = 20;
    this.scene.add(this.composite);
  }

  private updatePov() {
    const p = (this.globe as unknown as {
      pointOfView?: () => { lat: number; lng: number; altitude: number };
    }).pointOfView?.();
    if (p) this.pov = p;
  }

  // 입자를 뿌릴 범위(도). 전지구 격자는 넓게, 국지 격자는 화면 범위에 맞춰 밀도를 높인다.
  private spreadDeg(): { lat: number; lng: number } {
    if (this.grid.global) {
      const s = Math.min(170, Math.max(16, this.pov.altitude * 70));
      return { lat: s, lng: s * 1.4 };
    }
    const lat = Math.max(2.5, this.pov.altitude * 35);
    return { lat, lng: (lat * 1.5) / Math.max(0.3, Math.cos(this.pov.lat * DEG2RAD)) };
  }

  // lat/lng → 월드 좌표 (globe.gl getCoords로 정확히 정렬)
  private coords(lat: number, lng: number, out: number, arr: Float32Array) {
    const c = (this.globe as unknown as {
      getCoords: (lat: number, lng: number, alt: number) => { x: number; y: number; z: number };
    }).getCoords(lat, lng, ALTITUDE);
    arr[out] = c.x;
    arr[out + 1] = c.y;
    arr[out + 2] = c.z;
  }

  private spawn(i: number) {
    const spread = this.spreadDeg();
    let lat = Math.max(-(LAT_LIMIT - 3), Math.min(LAT_LIMIT - 3, this.pov.lat + (Math.random() * 2 - 1) * spread.lat));
    let lng = this.pov.lng + (Math.random() * 2 - 1) * spread.lng;
    if (lng > 180) lng -= 360;
    else if (lng < -180) lng += 360;
    // 새 격자를 받기 전 화면이 격자를 벗어났다면 격자 안에 뿌린다(멈춘 입자 방지)
    if (!isInGrid(this.grid, lat, lng)) {
      const g = this.grid;
      lat = g.latMin + Math.random() * g.latStep * (g.nLat - 1);
      lng = g.lngMin + Math.random() * g.lngStep * (g.nLng - 1);
      if (lng > 180) lng -= 360;
      else if (lng < -180) lng += 360;
    }
    this.lat[i] = lat;
    this.lng[i] = lng;
    this.age[i] = 0;
    this.maxAge[i] = MIN_AGE + Math.random() * (MAX_AGE - MIN_AGE);
    this.coords(lat, lng, i * 3, this.positions);
  }

  // 카메라가 움직였는지 (회전/줌) — 바뀌면 화면공간 누적을 초기화
  private cameraMoved(): boolean {
    const c = this.camera as THREE.PerspectiveCamera;
    const key =
      c.position.x.toFixed(1) + ',' + c.position.y.toFixed(1) + ',' + c.position.z.toFixed(1);
    if (key !== this.lastCamKey) {
      this.lastCamKey = key;
      return true;
    }
    return false;
  }

  private resizeIfNeeded() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    const dpr = this.renderer.getPixelRatio();
    const w = Math.max(2, Math.floor(size.x * dpr));
    const h = Math.max(2, Math.floor(size.y * dpr));
    if (this.trailRT.width !== w || this.trailRT.height !== h) {
      this.trailRT.setSize(w, h);
    }
    // 합성 쿼드를 카메라 정면에 풀스크린으로 배치
    const cam = this.camera as THREE.PerspectiveCamera;
    const dist = 1;
    const vh = 2 * Math.tan((cam.fov * DEG2RAD) / 2) * dist;
    const vw = vh * cam.aspect;
    this.composite.position.copy(cam.position);
    this.composite.quaternion.copy(cam.quaternion);
    this.composite.translateZ(-dist);
    this.composite.scale.set(vw, vh, 1);
  }

  private step = () => {
    if (!this.running) return;
    this.updatePov();
    const moved = this.cameraMoved();
    const spread = this.spreadDeg();
    const zoomedIn = this.pov.altitude < 1.3;
    const limitLat = zoomedIn ? spread.lat * 1.7 : 999;
    const limitLng = zoomedIn ? spread.lng * 1.7 : 999;
    // 확대할수록 화면에 보이는 각도가 좁으므로 이동량을 줄여 화면상 속도를 일정하게 유지
    const stepScale = STEP_SCALE * Math.min(1, Math.max(0.08, this.pov.altitude / 1.5));

    // 입자 이동 + 위치/색 버퍼 갱신
    for (let i = 0; i < this.count; i++) {
      const wind = sampleWind(this.grid, this.lat[i], this.lng[i]);
      const cosLat = Math.max(0.25, Math.cos(this.lat[i] * DEG2RAD));
      this.lng[i] += (wind.u / (111.32 * cosLat)) * stepScale;
      this.lat[i] += (wind.v / 111.32) * stepScale;
      if (this.lng[i] > 180) this.lng[i] -= 360;
      else if (this.lng[i] < -180) this.lng[i] += 360;
      this.age[i]++;

      let dLng = Math.abs(this.lng[i] - this.pov.lng);
      if (dLng > 180) dLng = 360 - dLng;
      const outOfView =
        Math.abs(this.lat[i] - this.pov.lat) > limitLat ||
        dLng > limitLng ||
        !isInGrid(this.grid, this.lat[i], this.lng[i]);
      if (this.age[i] > this.maxAge[i] || this.lat[i] > LAT_LIMIT || this.lat[i] < -LAT_LIMIT || outOfView) {
        this.spawn(i);
      } else {
        this.coords(this.lat[i], this.lng[i], i * 3, this.positions);
      }

      speedToColor(wind.speed, this._color);
      this.colors[i * 3] = this._color.r * INTENSITY;
      this.colors[i * 3 + 1] = this._color.g * INTENSITY;
      this.colors[i * 3 + 2] = this._color.b * INTENSITY;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

    this.resizeIfNeeded();

    // ── 렌더: trailRT에 누적 ──
    const renderer = this.renderer;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    renderer.setRenderTarget(this.trailRT);
    if (moved) {
      // 카메라 이동 시 번짐 방지: 누적 초기화
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
    } else {
      // 기존 자취를 서서히 어둡게 (페이드)
      renderer.render(this.fadeScene, this.fadeCam);
    }
    // 새 입자를 가산 렌더
    renderer.render(this.pointsScene, this.camera);

    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;

    this.rafId = requestAnimationFrame(this.step);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.rafId = requestAnimationFrame(this.step);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.scene.remove(this.composite);
    (this.composite.material as THREE.Material).dispose();
    this.composite.geometry.dispose();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.trailRT.dispose();
  }
}
