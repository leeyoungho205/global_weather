// 지구본 기상 오버레이 (자연스러운 구름 + 레이더 + 위성) — zoom.earth 스타일
//
// react-globe.gl의 타일 엔진은 레이어 전환 시 타일을 재로드하지 않으므로,
// 베이스는 항상 지도(Esri)로 두고 위성/레이더/구름을 "오버레이 구(sphere)"로 올린다.
// → 레이어를 바꿔도 카메라 위치가 그대로 유지된다.
import * as THREE from 'three';

const cloudVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ── 구름 오버레이 (equirectangular, 밝기→알파) ───────────────────────────────
const CLOUD_IMG = 'https://clouds.matteason.co.uk/images/2048x1024/clouds.jpg';
const cloudFragment = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(uTex, vec2(1.0 - vUv.x, vUv.y)).rgb;
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    float a = smoothstep(0.35, 0.8, lum);
    gl_FragColor = vec4(vec3(1.0), a * uOpacity);
  }
`;

export function createCloudOverlay(radius: number): {
  mesh: THREE.Mesh;
  dispose: () => void;
} {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const tex = loader.load(CLOUD_IMG);
  tex.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uOpacity: { value: 0.9 } },
    vertexShader: cloudVertex,
    fragmentShader: cloudFragment,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), material);
  mesh.name = 'cloud-overlay';
  mesh.renderOrder = 3;
  return {
    mesh,
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      tex.dispose();
    },
  };
}

// ── Mercator 오버레이 (위성/레이더 공용) ─────────────────────────────────────
// Web Mercator 타일을 합친 텍스처를 구의 equirect UV로 remap해 입힌다.
// useAlpha=true → 텍스처 알파 사용(레이더: 비 없는 곳 투명).
// useAlpha=false → 불투명(위성: 전체 이미지 표시).
const mercatorFragment = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uOpacity;
  uniform float uUseAlpha;
  varying vec2 vUv;
  void main() {
    float lat = (vUv.y - 0.5) * 3.14159265;
    if (abs(lat) > 1.4844) discard; // Web Mercator ±85.05° 밖
    float merc = 0.5 - log(tan(0.78539816 + lat * 0.5)) / (2.0 * 3.14159265);
    vec4 c = texture2D(uTex, vec2(1.0 - vUv.x, merc));
    float a = mix(1.0, c.a, uUseAlpha);
    if (uUseAlpha > 0.5 && c.a < 0.03) discard;
    gl_FragColor = vec4(c.rgb, a * uOpacity);
  }
`;

export function createMercatorOverlay(
  radius: number,
  opts: { useAlpha: boolean; opacity: number }
): {
  mesh: THREE.Mesh;
  setTexture: (tex: THREE.Texture) => void;
  dispose: () => void;
} {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: null },
      uOpacity: { value: opts.opacity },
      uUseAlpha: { value: opts.useAlpha ? 1 : 0 },
    },
    vertexShader: cloudVertex,
    fragmentShader: mercatorFragment,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 96), material);
  mesh.name = 'mercator-overlay';
  mesh.renderOrder = 2;
  mesh.visible = false;

  let prevTex: THREE.Texture | null = null;
  const setTexture = (tex: THREE.Texture) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    material.uniforms.uTex.value = tex;
    mesh.visible = true;
    prevTex?.dispose();
    prevTex = tex;
  };
  return {
    mesh,
    setTexture,
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      prevTex?.dispose();
    },
  };
}

// Web Mercator 타일(zoom z, 2^z×2^z 장)을 하나의 캔버스로 합쳐 CanvasTexture 생성.
export function stitchTiles(
  urlFn: (z: number, x: number, y: number) => string,
  z: number
): Promise<THREE.CanvasTexture> {
  const n = 1 << z;
  const tile = 256;
  const canvas = document.createElement('canvas');
  canvas.width = n * tile;
  canvas.height = n * tile;
  const ctx = canvas.getContext('2d')!;

  const loadTile = (x: number, y: number) =>
    new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, x * tile, y * tile, tile, tile);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = urlFn(z, x, y);
    });

  const jobs: Promise<void>[] = [];
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) jobs.push(loadTile(x, y));
  return Promise.all(jobs).then(() => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  });
}

// ── 어두운 오버레이 (바람 레이어용) ──────────────────────────────────────────
// 밝은 지도를 어둡게 덮어 가산 블렌딩 입자가 잘 보이게 한다.
export function createDarkOverlay(radius: number): {
  mesh: THREE.Mesh;
  dispose: () => void;
} {
  const material = new THREE.MeshBasicMaterial({
    color: 0x0a1020,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 48), material);
  mesh.name = 'dark-overlay';
  mesh.renderOrder = 1;
  return {
    mesh,
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
