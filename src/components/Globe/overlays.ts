// 지구본 기상 오버레이 (구름 + 강수 레이더 + 위성) — zoom.earth 스타일
//
// react-globe.gl의 타일 엔진은 레이어 전환 시 타일을 재로드하지 않으므로,
// 베이스는 항상 지도(Esri)로 두고 위성/레이더/구름을 "오버레이 구(sphere)"로 올린다.
//
// ⚠️ 좌표 정렬: three-globe는 자기 지구 메시를 rotation.y = -π/2 로 돌려 경도를 맞춘다.
// 오버레이도 똑같이 돌려야 UV의 u가 (경도+180)/360 이 되어 실제 위치와 일치한다.
import * as THREE from 'three';
import { isLocalView, viewHalfSpan, type View } from '../../utils/viewSpan';

const GLOBE_ROTATION_Y = -Math.PI / 2;

const overlayVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 위도(UV v) → Web Mercator Y(0=북, 1=남). 범위 밖은 호출 전에 걸러야 한다.
const mercatorGlsl = /* glsl */ `
  float latToMerc(float v) {
    float lat = (v - 0.5) * 3.14159265;
    return 0.5 - log(tan(0.78539816 + lat * 0.5)) / (2.0 * 3.14159265);
  }
`;

// 국지 윈도우(월드 좌표 분수 범위)
export interface MercWindow {
  lngF0: number; // 서쪽 경계 (0..1 = −180..180, 날짜변경선을 넘으면 음수 가능)
  lngF1: number; // 동쪽 경계
  mercF0: number; // 북쪽 경계 (Mercator Y)
  mercF1: number; // 남쪽 경계
}

// ── 구름 오버레이 ────────────────────────────────────────────────────────────
// 전지구: matteason 합성 이미지(4096×2048, 픽셀당 약 10km)
// 확대 시: 정지궤도 위성 적외선 타일(10분 간격, zoom 6 = 픽셀당 약 2.4km)을 섞어 국지 구름 표현.
// 위성 타일이 없는 지역(투명)은 자동으로 전지구 이미지를 사용한다.
const CLOUD_IMG = 'https://clouds.matteason.co.uk/images/4096x2048/clouds.jpg';
const cloudFragment = /* glsl */ `
  uniform sampler2D uTex;
  uniform sampler2D uLocal;
  uniform float uHasLocal;
  uniform vec4 uWindow;
  uniform float uOpacity;
  varying vec2 vUv;
  ${mercatorGlsl}
  void main() {
    vec3 g = texture2D(uTex, vUv).rgb;
    // 전지구 이미지는 찬 고위도 지표도 구름만큼 밝으므로 위도가 높을수록 기준을 올린다
    float latAbs = abs(vUv.y - 0.5) * 180.0;
    float cold = smoothstep(20.0, 45.0, latAbs);
    float a = smoothstep(mix(0.35, 0.88, cold), mix(0.8, 0.98, cold), dot(g, vec3(0.299, 0.587, 0.114)));

    if (uHasLocal > 0.5 && abs(vUv.y - 0.5) < 0.4725) {
      float u = fract(vUv.x - uWindow.x) / (uWindow.y - uWindow.x);
      float w = (latToMerc(vUv.y) - uWindow.z) / (uWindow.w - uWindow.z);
      if (u <= 1.0 && w >= 0.0 && w <= 1.0) {
        vec4 l = texture2D(uLocal, vec2(u, w));
        if (l.a > 0.5) {
          // 적외선 팔레트: 회색=차가울수록 밝음(구름), 유채색=매우 찬 구름 꼭대기
          float lum = dot(l.rgb, vec3(0.299, 0.587, 0.114));
          float sat = max(l.r, max(l.g, l.b)) - min(l.r, min(l.g, l.b));
          // 차가운 겨울 땅도 밝게 나오므로 구름으로 오인되지 않게 임계값을 높게 잡는다
          a = max(smoothstep(0.66, 0.86, lum), smoothstep(0.12, 0.3, sat));
        }
      }
    }
    gl_FragColor = vec4(vec3(1.0), a * uOpacity);
  }
`;

export function createCloudOverlay(radius: number): {
  mesh: THREE.Mesh;
  setLocal: (tex: THREE.Texture | null, window?: MercWindow | null) => void;
  dispose: () => void;
} {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  // 시간 태그로 브라우저 캐시를 우회해 페이지를 열 때 최신 이미지를 받는다.
  const hourTag = Math.floor(Date.now() / 3_600_000);
  const tex = loader.load(`${CLOUD_IMG}?t=${hourTag}`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: tex },
      uLocal: { value: null },
      uHasLocal: { value: 0 },
      uWindow: { value: new THREE.Vector4(0, 1, 0, 1) },
      uOpacity: { value: 0.9 },
    },
    vertexShader: overlayVertex,
    fragmentShader: cloudFragment,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), material);
  mesh.name = 'cloud-overlay';
  mesh.rotation.y = GLOBE_ROTATION_Y;
  mesh.renderOrder = 3;

  let localTex: THREE.Texture | null = null;
  const setLocal = (next: THREE.Texture | null, window?: MercWindow | null) => {
    localTex?.dispose();
    localTex = next;
    material.uniforms.uLocal.value = next;
    material.uniforms.uHasLocal.value = next && window ? 1 : 0;
    if (window) {
      material.uniforms.uWindow.value.set(window.lngF0, window.lngF1, window.mercF0, window.mercF1);
    }
  };
  return {
    mesh,
    setLocal,
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      tex.dispose();
      localTex?.dispose();
    },
  };
}

// 경도별 정지궤도 위성 적외선 타일. 약 30분 전 최신 영상을 'default' 시간으로 받는다.
// NASA GIBS에 유럽·아프리카(Meteosat) 레이어가 없어 해당 지역은 null → 전지구 구름 사용.
const GEO_SATELLITES = [
  { layer: 'Himawari_AHI_Band13_Clean_Infrared', lng: 140.7 },
  { layer: 'GOES-West_ABI_Band13_Clean_Infrared', lng: -137.2 },
  { layer: 'GOES-East_ABI_Band13_Clean_Infrared', lng: -75.2 },
];
export const CLOUD_MAX_ZOOM = 6;
// 축소 상태에서 쓰는 전지구 위성 구름 범위 (zoom 3 = 64타일)
export const GLOBAL_CLOUD_WINDOW: TileWindow = {
  z: 3, x0: 0, x1: 7, y0: 0, y1: 7,
  window: { lngF0: 0, lngF1: 1, mercF0: 0, mercF1: 1 },
};
export const geoCloudTileUrl =
  (tick: number) =>
  (z: number, x: number, y: number): string | null => {
    const lng = ((x + 0.5) / (1 << z)) * 360 - 180; // 타일 중심 경도
    let best: (typeof GEO_SATELLITES)[number] | null = null;
    let bestDist = 65; // 위성 직하점에서 65° 이내만 사용(가장자리는 왜곡이 큼)
    for (const sat of GEO_SATELLITES) {
      const d = Math.abs(((lng - sat.lng + 540) % 360) - 180);
      if (d < bestDist) {
        bestDist = d;
        best = sat;
      }
    }
    if (!best) return null;
    return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${best.layer}/default/default/GoogleMapsCompatible_Level6/${z}/${y}/${x}.png?t=${tick}`;
  };

// ── Mercator 오버레이 (위성/레이더 공용) ─────────────────────────────────────
// Web Mercator 타일을 합친 텍스처를 구의 UV로 변환해 입힌다.
// useAlpha=true → 텍스처 알파 사용(레이더: 비 없는 곳 투명) / false → 불투명(위성).
// window가 있으면 텍스처는 보이는 영역만 담고, 범위 밖은 그리지 않는다.
const mercatorFragment = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uOpacity;
  uniform float uUseAlpha;
  uniform float uHasWindow;
  uniform vec4 uWindow; // (lngF0, lngF1, mercF0, mercF1)
  varying vec2 vUv;
  ${mercatorGlsl}
  void main() {
    if (abs(vUv.y - 0.5) > 0.4725) discard; // Web Mercator ±85.05° 밖
    float merc = latToMerc(vUv.y);

    vec2 uvTex = vec2(vUv.x, merc);
    if (uHasWindow > 0.5) {
      float u = fract(vUv.x - uWindow.x) / (uWindow.y - uWindow.x);
      float w = (merc - uWindow.z) / (uWindow.w - uWindow.z);
      if (u > 1.0 || w < 0.0 || w > 1.0) discard;
      uvTex = vec2(u, w);
    }

    vec4 c = texture2D(uTex, uvTex);
    if (uUseAlpha > 0.5 && c.a < 0.03) discard;
    gl_FragColor = vec4(c.rgb, mix(1.0, c.a, uUseAlpha) * uOpacity);
  }
`;

export function createMercatorOverlay(
  radius: number,
  opts: { useAlpha: boolean; opacity: number }
): {
  mesh: THREE.Mesh;
  setTexture: (tex: THREE.Texture, window?: MercWindow | null) => void;
  dispose: () => void;
} {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: null },
      uOpacity: { value: opts.opacity },
      uUseAlpha: { value: opts.useAlpha ? 1 : 0 },
      uHasWindow: { value: 0 },
      uWindow: { value: new THREE.Vector4(0, 1, 0, 1) },
    },
    vertexShader: overlayVertex,
    fragmentShader: mercatorFragment,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 96), material);
  mesh.name = 'mercator-overlay';
  mesh.rotation.y = GLOBE_ROTATION_Y;
  mesh.renderOrder = 2;
  mesh.visible = false;

  let prevTex: THREE.Texture | null = null;
  const setTexture = (tex: THREE.Texture, window?: MercWindow | null) => {
    material.uniforms.uTex.value = tex;
    material.uniforms.uHasWindow.value = window ? 1 : 0;
    if (window) {
      material.uniforms.uWindow.value.set(window.lngF0, window.lngF1, window.mercF0, window.mercF1);
    }
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

// ── 타일 합성 ────────────────────────────────────────────────────────────────
// 타일 범위(윈도우)
export interface TileWindow {
  z: number;
  x0: number; x1: number; y0: number; y1: number; // 타일 인덱스(포함). x는 날짜변경선을 넘으면 범위 밖 가능
  window: MercWindow;
}

const latToMercFrac = (lat: number): number => {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

// 카메라 뷰에 맞는 zoom과 타일 범위 계산. 충분히 축소된 상태면 null(전지구 모드).
export function computeTileWindow(view: View, maxZoom: number, maxTilesPerSide = 6): TileWindow | null {
  if (!isLocalView(view)) return null;

  const { halfLat, halfLng } = viewHalfSpan(view);
  const fLng0 = (view.lng - halfLng + 180) / 360;
  const fLng1 = (view.lng + halfLng + 180) / 360;
  const fMercN = latToMercFrac(view.lat + halfLat);
  const fMercS = latToMercFrac(view.lat - halfLat);

  // 타일 수가 제한 이내인 가장 높은 zoom 선택
  let z = 2;
  for (let zz = maxZoom; zz >= 2; zz--) {
    const n = 1 << zz;
    const nx = Math.floor(fLng1 * n) - Math.floor(fLng0 * n) + 1;
    const ny = Math.floor(fMercS * n) - Math.floor(fMercN * n) + 1;
    if (nx <= maxTilesPerSide && ny <= maxTilesPerSide) {
      z = zz;
      break;
    }
  }

  const n = 1 << z;
  const x0 = Math.floor(fLng0 * n);
  const x1 = Math.floor(fLng1 * n);
  const y0 = Math.floor(fMercN * n);
  const y1 = Math.floor(fMercS * n);
  return {
    z, x0, x1, y0, y1,
    window: { lngF0: x0 / n, lngF1: (x1 + 1) / n, mercF0: y0 / n, mercF1: (y1 + 1) / n },
  };
}

type TileUrlFn = (z: number, x: number, y: number) => string | null;

// 지정한 타일 범위를 하나의 캔버스로 합쳐 텍스처 생성. 경도는 순환, 실패한 타일은 투명.
export function stitchTileWindow(urlFn: TileUrlFn, tw: TileWindow): Promise<THREE.CanvasTexture> {
  const { z, x0, x1, y0, y1 } = tw;
  const n = 1 << z;
  const tile = 256;
  const canvas = document.createElement('canvas');
  canvas.width = (x1 - x0 + 1) * tile;
  canvas.height = (y1 - y0 + 1) * tile;
  const ctx = canvas.getContext('2d')!;

  const loadTile = (x: number, y: number) =>
    new Promise<void>((resolve) => {
      const url = urlFn(z, ((x % n) + n) % n, y);
      if (!url) return resolve();
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, (x - x0) * tile, (y - y0) * tile, tile, tile);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });

  const jobs: Promise<void>[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) jobs.push(loadTile(x, y));
  }
  return Promise.all(jobs).then(() => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false; // 캔버스 위쪽 = 북쪽 = Mercator Y 0
    // 셰이더가 값을 그대로 출력하므로 색 변환 없이 원본 색을 유지
    tex.colorSpace = THREE.NoColorSpace;
    // 윈도우 경계에서 UV가 끊겨도 밉맵 줄무늬가 생기지 않도록 선형 필터만 사용
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  });
}

// 전지구 합성(zoom z의 2^z×2^z 타일 전체)
export function stitchTiles(urlFn: TileUrlFn, z: number): Promise<THREE.CanvasTexture> {
  const n = 1 << z;
  return stitchTileWindow(urlFn, {
    z, x0: 0, x1: n - 1, y0: 0, y1: n - 1,
    window: { lngF0: 0, lngF1: 1, mercF0: 0, mercF1: 1 },
  });
}

// ── 어두운 오버레이 (바람 레이어용) ──────────────────────────────────────────
// 밝은 지도를 어둡게 덮어 가산 블렌딩 입자가 잘 보이게 한다.
// depthTest=false + FrontSide → 앞(카메라쪽) 반구만 그려 지구 표면을 확실히 덮는다.
export function createDarkOverlay(radius: number): {
  mesh: THREE.Mesh;
  dispose: () => void;
} {
  const material = new THREE.MeshBasicMaterial({
    color: 0x0a1222,
    transparent: true,
    opacity: 0.45, // 지도가 비쳐 보이도록 (가산 블렌딩 입자는 여전히 잘 보임)
    side: THREE.FrontSide,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), material);
  mesh.name = 'dark-overlay';
  mesh.renderOrder = 1; // 지구(불투명) 다음, 입자보다 먼저
  return {
    mesh,
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
