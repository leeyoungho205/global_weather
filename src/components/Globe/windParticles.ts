// nullschool 스타일 바람 입자 흐름 시스템 (순수 Three.js)
//
// 원리:
// 1) 입자 수천 개를 지구 표면 임의 위치에 뿌림
// 2) 매 프레임 각 입자 위치의 바람 벡터를 샘플링해 위경도를 이동
// 3) 각 입자의 최근 궤적(trail)을 선으로 그려 "흐르는 선" 효과
// 4) 수명이 다하거나 격자 밖으로 나가면 재생성(respawn)
// 색상은 풍속에 따라 파랑(약)→초록→노랑→빨강(강)

import * as THREE from 'three';
import type { GlobeInstance } from 'globe.gl';
import { sampleWind, type WindGrid } from '../../services/windApi';

const DEG2RAD = Math.PI / 180;

// ── 튜닝 상수 ──────────────────────────────────────────────
const PARTICLE_COUNT = 3500; // 입자 수
const TRAIL_LEN = 11; // 궤적 점 개수 (세그먼트는 TRAIL_LEN-1)
const STEP_SCALE = 0.55; // 프레임당 이동 배율 (클수록 빠름)
const ALTITUDE = 0.008; // 표면에서 살짝 띄우기
const INTENSITY = 1.15; // 색상 밝기 배율 (가산 블렌딩이라 1 초과 허용)
const MIN_AGE = 50;
const MAX_AGE = 130;

// 풍속(km/h) → 색상 (파랑→청록→초록→노랑→빨강)
const speedToColor = (speed: number, out: THREE.Color): THREE.Color => {
  // 구간별 색 보간
  const stops: [number, number, number, number][] = [
    [0, 0.45, 0.72, 1.0], // 밝은 파랑
    [15, 0.3, 0.95, 0.95], // 청록
    [30, 0.45, 1.0, 0.5], // 초록
    [55, 1.0, 0.95, 0.35], // 노랑
    [85, 1.0, 0.6, 0.2], // 주황
    [120, 1.0, 0.35, 0.35], // 빨강
  ];
  let s = speed;
  if (s <= stops[0][0]) return out.setRGB(stops[0][1], stops[0][2], stops[0][3]);
  if (s >= stops[stops.length - 1][0]) {
    const l = stops[stops.length - 1];
    return out.setRGB(l[1], l[2], l[3]);
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (s >= a[0] && s < b[0]) {
      const t = (s - a[0]) / (b[0] - a[0]);
      return out.setRGB(
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        a[3] + (b[3] - a[3]) * t
      );
    }
  }
  return out;
};

interface Particle {
  lat: number;
  lng: number;
  age: number;
  maxAge: number;
  speed: number;
  trail: Float32Array; // [x,y,z] * TRAIL_LEN, index 0 = 최신
}

export class WindParticles {
  private scene: THREE.Scene;
  private globe: GlobeInstance;
  private grid: WindGrid;
  private particles: Particle[] = [];
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private lines: THREE.LineSegments;
  private rafId = 0;
  private running = false;
  private _color = new THREE.Color();

  constructor(scene: THREE.Scene, globe: GlobeInstance, grid: WindGrid) {
    this.scene = scene;
    this.globe = globe;
    this.grid = grid;

    // 세그먼트 수 = 입자수 * (궤적점-1), 정점 = 세그먼트 * 2
    const segPerParticle = TRAIL_LEN - 1;
    const vertexCount = PARTICLE_COUNT * segPerParticle * 2;
    this.positions = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // 어두운 꼬리색 = 자연스러운 페이드
    });

    this.lines = new THREE.LineSegments(this.geometry, material);
    this.lines.name = 'wind-particles';
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);

    // 입자 초기화
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push(this.spawn());
    }
  }

  // 위경도 → 지구본 씬 좌표 (globe.gl의 getCoords로 정확히 정렬)
  private coords(lat: number, lng: number): [number, number, number] {
    const c = (this.globe as unknown as {
      getCoords: (lat: number, lng: number, alt: number) => { x: number; y: number; z: number };
    }).getCoords(lat, lng, ALTITUDE);
    return [c.x, c.y, c.z];
  }

  // 입자 생성/재생성
  private spawn(p?: Particle): Particle {
    const lat = (Math.random() * 150 - 75); // -75 ~ 75
    const lng = Math.random() * 360 - 180;
    const pos = this.coords(lat, lng);
    const trail = p?.trail ?? new Float32Array(TRAIL_LEN * 3);
    // 궤적을 현재 위치로 채워 초기 점프선 방지
    for (let k = 0; k < TRAIL_LEN; k++) {
      trail[k * 3] = pos[0];
      trail[k * 3 + 1] = pos[1];
      trail[k * 3 + 2] = pos[2];
    }
    const particle: Particle = {
      lat,
      lng,
      age: 0,
      maxAge: MIN_AGE + Math.random() * (MAX_AGE - MIN_AGE),
      speed: 0,
      trail,
    };
    if (p) Object.assign(p, particle);
    return p ?? particle;
  }

  // 한 프레임: 입자 이동 + 버퍼 갱신
  private step = () => {
    if (!this.running) return;
    const { positions, colors } = this;
    const segPerParticle = TRAIL_LEN - 1;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      const wind = sampleWind(this.grid, p.lat, p.lng);
      p.speed = wind.speed;

      // 위경도 이동 (u=동쪽, v=북쪽 성분)
      const cosLat = Math.max(0.25, Math.cos(p.lat * DEG2RAD));
      p.lng += (wind.u / (111.32 * cosLat)) * STEP_SCALE;
      p.lat += (wind.v / 111.32) * STEP_SCALE;

      // 경도 순환
      if (p.lng > 180) p.lng -= 360;
      else if (p.lng < -180) p.lng += 360;

      p.age++;

      // 수명/범위 초과 시 재생성
      if (p.age > p.maxAge || p.lat > 84 || p.lat < -84) {
        this.spawn(p);
      } else {
        // 궤적 shift: 뒤에서 앞으로 밀고 맨 앞에 새 위치
        const t = p.trail;
        for (let k = TRAIL_LEN - 1; k > 0; k--) {
          t[k * 3] = t[(k - 1) * 3];
          t[k * 3 + 1] = t[(k - 1) * 3 + 1];
          t[k * 3 + 2] = t[(k - 1) * 3 + 2];
        }
        const head = this.coords(p.lat, p.lng);
        t[0] = head[0];
        t[1] = head[1];
        t[2] = head[2];
      }

      // 색상(풍속 기반) — 가산 블렌딩이라 밝기 배율을 곱해 또렷하게
      speedToColor(p.speed, this._color);
      const cr = this._color.r * INTENSITY;
      const cg = this._color.g * INTENSITY;
      const cb = this._color.b * INTENSITY;

      // 세그먼트별 버퍼 작성
      const base = i * segPerParticle * 2 * 3;
      const t = p.trail;
      for (let k = 0; k < segPerParticle; k++) {
        // 머리(k=0) 밝고 꼬리로 갈수록 어둡게 (additive 페이드)
        const fade = 1 - k / segPerParticle;
        const o = base + k * 6;
        // 정점 0 = trail[k], 정점 1 = trail[k+1]
        positions[o] = t[k * 3];
        positions[o + 1] = t[k * 3 + 1];
        positions[o + 2] = t[k * 3 + 2];
        positions[o + 3] = t[(k + 1) * 3];
        positions[o + 4] = t[(k + 1) * 3 + 1];
        positions[o + 5] = t[(k + 1) * 3 + 2];
        const f0 = fade;
        const f1 = 1 - (k + 1) / segPerParticle;
        colors[o] = cr * f0; colors[o + 1] = cg * f0; colors[o + 2] = cb * f0;
        colors[o + 3] = cr * f1; colors[o + 4] = cg * f1; colors[o + 5] = cb * f1;
      }
    }

    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

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
    this.scene.remove(this.lines);
    this.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
