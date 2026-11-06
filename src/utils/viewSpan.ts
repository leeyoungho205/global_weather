// 카메라 뷰 → "지금 보이는 범위" 계산 (바람 격자/강수·구름 타일이 함께 사용)

export interface View {
  lat: number;
  lng: number;
  altitude: number;
}

// 이 고도보다 낮으면(더 확대하면) 국지 고해상도 데이터로 전환
export const LOCAL_ALTITUDE = 1.2;

export const isLocalView = (view: View): boolean => view.altitude < LOCAL_ALTITUDE;

// 보이는 영역보다 약간 넉넉한 반경(도). 고위도는 경도 1°가 짧아 경도 폭을 넓힌다.
export const viewHalfSpan = (view: View): { halfLat: number; halfLng: number } => {
  const halfLat = Math.min(60, Math.max(5, view.altitude * 45));
  const cosLat = Math.max(0.3, Math.cos((view.lat * Math.PI) / 180));
  return { halfLat, halfLng: Math.min(170, (halfLat * 1.5) / cosLat) };
};
