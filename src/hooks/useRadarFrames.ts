// RainViewer 레이더 프레임 훅
// 선택한 프레임은 스토어(radarTimestamp)에 저장 → 지구본과 타임라인이 같은 프레임을 공유한다.
// 인덱스 대신 시각으로 저장하므로 목록이 갱신돼도 선택한 프레임이 밀리지 않는다.
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRadarFrames, type RadarFrame } from '../services/radarApi';
import { useMapStore } from '../store/mapStore';

const EMPTY_FRAMES: RadarFrame[] = [];

export const useRadarFrames = () => {
  const radarTimestamp = useMapStore((s) => s.radarTimestamp);
  const setRadarTimestamp = useMapStore((s) => s.setRadarTimestamp);

  // 5분마다 레이더 프레임 갱신
  const { data, isLoading, error } = useQuery({
    queryKey: ['radar-frames'],
    queryFn: fetchRadarFrames,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  // 과거 프레임 + 예측 프레임(최대 2개)
  const frames = useMemo(
    () => (data ? [...data.radar.past, ...data.radar.nowcast.slice(0, 2)] : EMPTY_FRAMES),
    [data]
  );
  const latestIndex = (data?.radar.past.length ?? 1) - 1; // 가장 최근 관측 프레임

  // 선택한 시각이 없거나 목록에서 사라졌으면 최신 관측 프레임을 보여 준다
  const selectedIndex =
    radarTimestamp === null ? -1 : frames.findIndex((f) => f.time === radarTimestamp);
  const currentIndex = selectedIndex >= 0 ? selectedIndex : latestIndex;

  const setFrameIndex = useCallback(
    (index: number) => setRadarTimestamp(frames[index]?.time ?? null),
    [frames, setRadarTimestamp]
  );

  const nextFrame = useCallback(() => {
    if (frames.length > 0) setFrameIndex((currentIndex + 1) % frames.length);
  }, [frames.length, currentIndex, setFrameIndex]);

  const prevFrame = useCallback(() => {
    if (frames.length > 0) setFrameIndex((currentIndex - 1 + frames.length) % frames.length);
  }, [frames.length, currentIndex, setFrameIndex]);

  // '지금': 선택을 해제해 앞으로 들어오는 최신 프레임도 계속 따라간다
  const goLatest = useCallback(() => setRadarTimestamp(null), [setRadarTimestamp]);

  return {
    frames,
    currentIndex,
    currentFrame: frames[currentIndex] ?? null,
    host: data?.host ?? '',
    isLoading,
    error: error?.message ?? null,
    nextFrame,
    prevFrame,
    setFrameIndex,
    goLatest,
  };
};
