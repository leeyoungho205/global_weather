// 활성 태풍 데이터 패칭 훅 (GDACS)
import { useQuery } from '@tanstack/react-query';
import { fetchActiveStorms, fetchStormTrack, type Storm } from '../services/stormApi';

// 태풍 레이어일 때만 활성 태풍 + 각 경로를 가져온다.
export const useStorms = (enabled: boolean) => {
  const query = useQuery({
    queryKey: ['storms'],
    queryFn: async (): Promise<Storm[]> => {
      const storms = await fetchActiveStorms();
      // 요청 과다(429) 방지: 풍속 상위 8개만 경로 로드, 나머지는 아이콘·링만 표시
      const ranked = [...storms].sort((a, b) => b.windKmh - a.windKmh);
      const trackIds = new Set(ranked.slice(0, 8).map((s) => s.id));
      const withTracks = await Promise.all(
        storms.map(async (s) =>
          trackIds.has(s.id)
            ? { ...s, track: await fetchStormTrack(s.geometryUrl) }
            : s
        )
      );
      return withTracks;
    },
    enabled,
    staleTime: 30 * 60 * 1000, // 30분 캐시
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  return {
    storms: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  };
};
