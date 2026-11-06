// 활성 태풍 데이터 패칭 훅 — 항상 표시하므로 앱이 켜져 있는 동안 주기적으로 갱신
import { useQuery } from '@tanstack/react-query';
import { fetchActiveStorms, type Storm } from '../services/stormApi';

export const useStorms = () => {
  const query = useQuery({
    queryKey: ['storms'],
    queryFn: fetchActiveStorms,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000, // 원본 데이터는 수 시간 간격으로 갱신됨
    retry: 1,
  });

  return {
    storms: (query.data ?? []) as Storm[],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  };
};
