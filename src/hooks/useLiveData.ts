// 실시간 자료를 받아 오는 훅 모음 (React Query로 캐시·재시도·주기적 새로고침)
// 같은 queryKey를 쓰는 컴포넌트끼리는 자료를 공유하므로, 여러 곳에서 불러도 한 번만 받습니다.
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { latestSatelliteTime, timeKey, wmsGlobalUrl, fetchBitmap } from '../services/gibs';
import { buildCloudCanvas } from '../services/clouds';
import { buildRadarCanvas, fetchRadarFrames, pickRadarFrame } from '../services/radarApi';
import { fetchStorms } from '../services/stormsApi';
import { fetchWeatherGrid } from '../services/weatherGrid';
import { selectedTimeOf, useMapStore } from '../store/mapStore';

const MINUTE = 60000;

// 가장 최근 위성 사진 시각 (10분마다 확인) → 스토어에 저장
export const useLatestTime = () => {
  const setLatestTime = useMapStore((s) => s.setLatestTime);
  const query = useQuery({
    queryKey: ['latest-satellite-time'],
    queryFn: latestSatelliteTime,
    refetchInterval: 10 * MINUTE,
    retry: 2,
  });
  useEffect(() => {
    if (query.data) setLatestTime(query.data);
  }, [query.data, setLatestTime]);
  return query;
};

// 지금 시계가 가리키는 시각 (최신 사진 시각 + 거슬러 간 분)
export const useSelectedTime = (): Date | null => {
  const latest = useMapStore((s) => s.latestTime);
  const offset = useMapStore((s) => s.frameOffset);
  return useMemo(() => (latest ? selectedTimeOf(latest, offset) : null), [latest, offset]);
};

// 그 시각의 전 세계 구름 그림
export const useClouds = (time: Date | null, enabled: boolean) =>
  useQuery({
    queryKey: ['clouds', time ? timeKey(time) : null],
    queryFn: () => buildCloudCanvas(time!),
    enabled: enabled && !!time,
    staleTime: Infinity, // 지난 시각의 사진은 바뀌지 않습니다
    gcTime: 15 * MINUTE,
    retry: 1,
    placeholderData: (previous) => previous, // 새 그림이 올 때까지 이전 그림을 보여 줌
  });

// 레이더 프레임 목록 (5분마다)
export const useRadarFrames = () =>
  useQuery({
    queryKey: ['radar-frames'],
    queryFn: fetchRadarFrames,
    refetchInterval: 5 * MINUTE,
    staleTime: 5 * MINUTE,
  });

// 그 시각에 가장 가까운 레이더 그림
export const useRadar = (time: Date | null, enabled: boolean) => {
  const frames = useRadarFrames();
  const frame = frames.data && time ? pickRadarFrame(frames.data.radar.past, time) : null;
  const canvas = useQuery({
    queryKey: ['radar-canvas', frame?.path],
    queryFn: () => buildRadarCanvas(frames.data!.host, frame!),
    enabled: enabled && !!frame,
    staleTime: Infinity,
    gcTime: 15 * MINUTE,
    placeholderData: (previous) => previous,
  });
  return { frames, frame, canvas };
};

// 고온 지점 (VIIRS, 하루 단위) — 지구 전체 그림 한 장
export const useFires = (enabled: boolean) =>
  useQuery({
    queryKey: ['fires'],
    queryFn: async () => {
      const bitmap = await fetchBitmap(
        wmsGlobalUrl('VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_NOAA21_Thermal_Anomalies_375m_All', {
          width: 4096,
          height: 2048,
        }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      bitmap.close();
      return canvas;
    },
    enabled,
    staleTime: 60 * MINUTE,
  });

// 진행 중인 열대 저기압 (30분마다)
export const useStorms = () =>
  useQuery({
    queryKey: ['storms'],
    queryFn: fetchStorms,
    refetchInterval: 30 * MINUTE,
    staleTime: 30 * MINUTE,
  });

// 전 세계 기온·바람 격자 (1시간 저장)
export const useWeatherGrid = (enabled: boolean) =>
  useQuery({
    queryKey: ['weather-grid'],
    queryFn: fetchWeatherGrid,
    enabled,
    staleTime: 60 * MINUTE,
    // 무료 한도(1분)에 걸리면 1분 뒤에 다시 시도합니다
    retry: (count) => count < 3,
    retryDelay: (_count, error) => (error instanceof Error && error.message === 'RATE_LIMIT' ? 61000 : 3000),
  });
