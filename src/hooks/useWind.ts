// 바람 격자 패칭 훅 (React Query) — 줌에 따라 전지구/국지 격자 자동 전환
import { useRef } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchWindGrid, type WindGrid } from '../services/windApi';
import { isLocalView, viewHalfSpan, type View } from '../utils/viewSpan';

// 뷰를 칸 단위로 묶는다. 같은 칸 안의 작은 이동/줌은 재요청하지 않아 API 한도를 아낀다.
// 고도는 위쪽 2의 거듭제곱으로 올리고, 칸은 격자 반경의 절반이라
// 칸 안 어디에서 봐도 격자가 화면을 덮는다. 전지구 상태면 null.
const quantizeView = (view: View): View | null => {
  if (!isLocalView(view)) return null;
  const altitude = Math.max(0.125, 2 ** Math.ceil(Math.log2(view.altitude)));
  const latCell = viewHalfSpan({ lat: view.lat, lng: 0, altitude }).halfLat / 2;
  const lat = Math.round(view.lat / latCell) * latCell;
  const lngCell = viewHalfSpan({ lat, lng: 0, altitude }).halfLng / 2;
  return { lat, lng: Math.round(view.lng / lngCell) * lngCell, altitude };
};

export const useWind = (enabled: boolean, view: View) => {
  const area = quantizeView(view);
  const query = useQuery({
    queryKey: ['wind-grid', area],
    queryFn: () => fetchWindGrid(area),
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000, // Open-Meteo 현재값은 15분 간격으로 갱신됨
    placeholderData: keepPreviousData, // 새 영역을 받는 동안 이전 격자 유지
    retry: 1,
  });

  // 요청이 실패해도(예: 429 한도 초과) 마지막으로 받은 격자를 계속 사용
  const lastGrid = useRef<WindGrid | null>(null);
  if (query.data) lastGrid.current = query.data;

  return {
    windGrid: query.data ?? lastGrid.current,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  };
};
