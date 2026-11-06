// zoom.earth 스타일 하단 타임라인 (레이더 프레임 재생/탐색)
import { useEffect, useRef, useState } from 'react';
import { useRadarFrames } from '../../hooks/useRadarFrames';

const PLAY_INTERVAL_MS = 800; // 재생 시 프레임 간격

// Unix 타임스탬프 → "11월 4일 13:20"
const formatStamp = (ts: number): string => {
  const d = new Date(ts * 1000);
  return (
    d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
};

const TimeSlider = () => {
  const { frames, currentIndex, isLoading, setFrameIndex, nextFrame, prevFrame, goLatest } =
    useRadarFrames();

  // 재생 상태는 타임라인에만 둔다 (강수량을 끄면 타임라인과 함께 재생도 멈춤)
  const [isPlaying, setIsPlaying] = useState(false);
  const togglePlay = () => setIsPlaying((v) => !v);

  // 최신 nextFrame을 ref로 읽어, 프레임이 바뀔 때마다 타이머가 초기화되지 않게 한다
  const nextRef = useRef(nextFrame);
  useEffect(() => {
    nextRef.current = nextFrame;
  }, [nextFrame]);
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => nextRef.current(), PLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isPlaying]);

  if (isLoading || frames.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900/80 backdrop-blur-xl border border-white/10 text-slate-300 text-xs">
        <div className="animate-spin h-3.5 w-3.5 border-2 border-slate-400 border-t-transparent rounded-full" />
        레이더 로딩 중...
      </div>
    );
  }

  const current = frames[currentIndex]?.time ?? 0;
  const latestIdx = frames.length - 1;

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl">
      {/* 재생/정지 */}
      <button
        onClick={togglePlay}
        className="h-9 w-9 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors"
        aria-label={isPlaying ? '정지' : '재생'}
      >
        {isPlaying ? (
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M6 5h3v10H6zM11 5h3v10h-3z" /></svg>
        ) : (
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M6 4l10 6-10 6z" /></svg>
        )}
      </button>

      {/* 이전 프레임 */}
      <button onClick={prevFrame} className="h-8 w-8 flex items-center justify-center rounded-full text-slate-300 hover:bg-white/10" aria-label="이전">
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path d="M13 5l-6 5 6 5zM6 5h1.5v10H6z" /></svg>
      </button>

      {/* 현재 시각 + 슬라이더 */}
      <div className="flex flex-col items-center px-2 min-w-[150px]">
        <span className="text-white text-xs font-semibold tabular-nums">
          {current ? formatStamp(current) : ''}
        </span>
        <input
          type="range"
          min={0}
          max={latestIdx}
          value={currentIndex}
          onChange={(e) => setFrameIndex(Number(e.target.value))}
          className="w-full h-1 mt-1 accent-blue-500 cursor-pointer"
        />
      </div>

      {/* 다음 프레임 */}
      <button onClick={nextFrame} className="h-8 w-8 flex items-center justify-center rounded-full text-slate-300 hover:bg-white/10" aria-label="다음">
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path d="M7 5l6 5-6 5zM12.5 5H14v10h-1.5z" /></svg>
      </button>

      {/* 최근 시간 */}
      <button
        onClick={() => {
          setIsPlaying(false);
          goLatest();
        }}
        className="h-8 px-3 flex items-center rounded-full text-blue-400 hover:bg-white/10 text-xs font-semibold"
        aria-label="최근"
      >
        지금
      </button>
    </div>
  );
};

export default TimeSlider;
