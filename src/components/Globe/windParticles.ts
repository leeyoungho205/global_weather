// 3D 바람 파티클: 작은 입자 수천 개가 실제 바람 방향·세기대로 지구 표면을 따라 흐릅니다.
// 입자마다 최근 위치 몇 개를 기억해 꼬리(선분)를 그리고, 꼬리 끝으로 갈수록 어둡게 해서 사라지게 보입니다.
// (더하기 섞기(AdditiveBlending)를 써서 검은색 = 투명처럼 보입니다)
import * as THREE from 'three';
import type { GlobeInstance } from 'globe.gl';
import { sampleGrid, type WeatherGrid } from '../../services/weatherGrid';

const COUNT = 6000; // 입자 수
const TRAIL = 12; // 꼬리 길이 (선분 수)
const ALTITUDE = 0.016; // 구름보다 살짝 위
const MAX_AGE = 140; // 이 프레임 수가 지나면 새 자리에서 다시 시작
const SPEED = 0.0065; // (km/h) → (도/프레임). 30 km/h ≈ 한 프레임에 0.2° (실제보다 아주 빠르게 보여 줍니다)

const toRad = Math.PI / 180;

export class WindParticles {
  readonly mesh: THREE.LineSegments;
  private globe: GlobeInstance;
  private grid: WeatherGrid;
  private lat = new Float32Array(COUNT);
  private lng = new Float32Array(COUNT);
  private age = new Uint16Array(COUNT);
  private history: Float32Array; // 입자마다 최근 (TRAIL+1)개 위치의 xyz
  private positions: Float32Array;

  constructor(globe: GlobeInstance, grid: WeatherGrid) {
    this.globe = globe;
    this.grid = grid;
    this.history = new Float32Array(COUNT * (TRAIL + 1) * 3);
    this.positions = new Float32Array(COUNT * TRAIL * 2 * 3);

    // 꼬리 색: 머리 쪽은 밝게, 꼬리 끝은 검게(= 투명하게)
    const colors = new Float32Array(COUNT * TRAIL * 2 * 3);
    for (let p = 0; p < COUNT; p++) {
      for (let s = 0; s < TRAIL; s++) {
        const head = 1 - s / TRAIL; // 선분의 머리 쪽 밝기
        const tail = 1 - (s + 1) / TRAIL;
        const base = (p * TRAIL + s) * 6;
        for (let c = 0; c < 3; c++) {
          colors[base + c] = head * 0.95;
          colors[base + 3 + c] = tail * 0.95;
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new THREE.LineSegments(geometry, material);
    this.mesh.name = 'wind-particles';
    this.mesh.renderOrder = 10;
    this.mesh.frustumCulled = false;
    for (let p = 0; p < COUNT; p++) this.respawn(p, true);
  }

  // 새 격자 값으로 바꾸기 (1시간마다 새로 받을 때)
  setGrid(grid: WeatherGrid) {
    this.grid = grid;
  }

  // 지구 표면에 고르게 흩뿌리기 (위도는 sin 값을 고르게 뽑아야 극지방에 몰리지 않습니다)
  private respawn(p: number, randomAge = false) {
    this.lat[p] = Math.asin(Math.random() * 2 - 1) / toRad;
    this.lng[p] = Math.random() * 360 - 180;
    this.age[p] = randomAge ? Math.floor(Math.random() * MAX_AGE) : 0;
    const { x, y, z } = this.globe.getCoords(this.lat[p], this.lng[p], ALTITUDE);
    const h = p * (TRAIL + 1) * 3;
    for (let k = 0; k <= TRAIL; k++) {
      this.history[h + k * 3] = x;
      this.history[h + k * 3 + 1] = y;
      this.history[h + k * 3 + 2] = z;
    }
  }

  // 한 프레임 진행: 바람대로 움직이고, 꼬리를 한 칸씩 밀어 냅니다
  step() {
    const { windU, windV } = this.grid;
    for (let p = 0; p < COUNT; p++) {
      const lat = this.lat[p];
      const lng = this.lng[p];
      const u = sampleGrid(windU, lat, lng);
      const v = sampleGrid(windV, lat, lng);
      this.age[p]++;
      if (Number.isNaN(u) || Number.isNaN(v) || this.age[p] > MAX_AGE || Math.abs(lat) > 84) {
        this.respawn(p);
        continue;
      }
      // 경도 1°의 실제 길이는 위도가 높을수록 짧아지므로 cos(위도)로 나눕니다
      const newLat = lat + v * SPEED;
      let newLng = lng + (u * SPEED) / Math.max(0.2, Math.cos(lat * toRad));
      if (newLng > 180) newLng -= 360;
      if (newLng < -180) newLng += 360;
      this.lat[p] = newLat;
      this.lng[p] = newLng;

      // 꼬리 밀어 내기: history[0] = 머리(지금), history[TRAIL] = 꼬리 끝
      const h = p * (TRAIL + 1) * 3;
      this.history.copyWithin(h + 3, h, h + TRAIL * 3);
      const { x, y, z } = this.globe.getCoords(newLat, newLng, ALTITUDE);
      this.history[h] = x;
      this.history[h + 1] = y;
      this.history[h + 2] = z;
    }

    // 꼬리 위치 → 선분 꼭짓점
    for (let p = 0; p < COUNT; p++) {
      const h = p * (TRAIL + 1) * 3;
      // 막 다시 태어난 입자는 꼬리가 한 점에 모여 있어 보이지 않습니다
      for (let s = 0; s < TRAIL; s++) {
        const o = (p * TRAIL + s) * 6;
        this.positions.set(this.history.subarray(h + s * 3, h + s * 3 + 3), o);
        this.positions.set(this.history.subarray(h + (s + 1) * 3, h + (s + 1) * 3 + 3), o + 3);
      }
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
