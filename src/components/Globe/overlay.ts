// 지구본 위에 얇은 "덮개 구"를 씌워 지구 전체 그림(구름, 레이더, 기온 등)을 입히는 도구
// 그림은 등장방형(가로 = 경도 -180°→180°, 세로 = 위도 90°→-90°)이어야 합니다.
// 구의 꼭짓점 위치를 globe.getCoords(위도, 경도)로 직접 계산하므로, 지구본 방향과 정확히 맞습니다.
import * as THREE from 'three';
import type { GlobeInstance } from 'globe.gl';

const LAT_SEGMENTS = 90;
const LNG_SEGMENTS = 180;

// altitude: 지구 반지름 대비 높이 (0.01 = 지표에서 1%)
export const createOverlay = (globe: GlobeInstance, name: string, altitude: number, renderOrder: number): THREE.Mesh => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= LAT_SEGMENTS; j++) {
    const lat = 90 - (j / LAT_SEGMENTS) * 180;
    for (let i = 0; i <= LNG_SEGMENTS; i++) {
      const lng = -180 + (i / LNG_SEGMENTS) * 360;
      const { x, y, z } = globe.getCoords(lat, lng, altitude);
      positions.push(x, y, z);
      // 그림의 위쪽(v=1)이 북극이 되도록 (three.js 텍스처는 기본으로 위아래가 뒤집혀 올라갑니다)
      uvs.push(i / LNG_SEGMENTS, 1 - j / LAT_SEGMENTS);
    }
  }
  const row = LNG_SEGMENTS + 1;
  for (let j = 0; j < LAT_SEGMENTS; j++) {
    for (let i = 0; i < LNG_SEGMENTS; i++) {
      const a = j * row + i;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false, // 덮개끼리 서로 가리지 않도록
    // 바깥쪽 면만 그립니다. 양면으로 그리면 지구 반대편의 구름이 비쳐 보입니다
    // (삼각형 꼭짓점을 바깥에서 볼 때 반시계 방향으로 넣어 두었습니다)
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = renderOrder;
  mesh.visible = false;
  return mesh;
};

// 덮개에 그림 입히기 (null이면 숨김)
export const setOverlayImage = (mesh: THREE.Mesh, canvas: HTMLCanvasElement | null, opacity = 1) => {
  const material = mesh.material as THREE.MeshBasicMaterial;
  if (!canvas) {
    mesh.visible = false;
    return;
  }
  if (!material.map || material.map.image !== canvas) {
    material.map?.dispose();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    material.map = texture;
    material.needsUpdate = true;
  }
  material.opacity = opacity;
  mesh.visible = true;
};

export const disposeOverlay = (scene: THREE.Scene, mesh: THREE.Mesh) => {
  scene.remove(mesh);
  mesh.geometry.dispose();
  const material = mesh.material as THREE.MeshBasicMaterial;
  material.map?.dispose();
  material.dispose();
};
