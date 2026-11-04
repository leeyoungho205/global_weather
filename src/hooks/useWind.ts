// 전지구 바람 격자 패칭 훅 (React Query)
import { useQuery } from '@tanstack/react-query';
import { fetchWindGrid } from '../services/windApi';

// 바람 격자를 가져오는 훅. enabled로 '바람' 레이어일 때만 요청.
export const useWind = (enabled: boolean) => {
  const query = useQuery({
    queryKey: ['wind-grid'],
    queryFn: fetchWindGrid,
    enabled,
    staleTime: 30 * 60 * 1000, // 30분 캐시
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  return {
    windGrid: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  };
};
