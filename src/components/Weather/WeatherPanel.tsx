// 날씨 정보 메인 패널 컴포넌트 (모바일: 바텀시트 / 데스크톱: 사이드패널)
import { useMapStore } from '../../store/mapStore';
import { useWeather } from '../../hooks/useWeather';
import { formatCoords } from '../../utils/formatters';
import CurrentWeather from './CurrentWeather';
import ForecastList from './ForecastList';
import WeatherDetails from './WeatherDetails';

const WeatherPanel = () => {
  const { selectedLocation, isPanelOpen, setIsPanelOpen } = useMapStore();

  // 선택된 위치의 날씨 데이터 조회
  const { currentWeather, dailyForecast, isLoading, error } = useWeather(
    selectedLocation?.lat ?? null,
    selectedLocation?.lng ?? null
  );

  // 패널이 닫혀있거나 위치가 없으면 렌더링하지 않음
  if (!isPanelOpen || !selectedLocation) return null;

  // 위치 이름 결정
  const locationName = selectedLocation.name
    ? `${selectedLocation.name}${selectedLocation.country ? `, ${selectedLocation.country}` : ''}`
    : formatCoords(selectedLocation.lat, selectedLocation.lng);

  return (
    <div className={`
      fixed z-50 bg-slate-900/95 backdrop-blur-md border border-slate-700/50
      rounded-t-2xl md:rounded-2xl shadow-2xl
      transition-transform duration-300 ease-out
      /* 모바일: 하단 시트 */
      bottom-0 left-0 right-0 max-h-[70vh] overflow-y-auto
      /* 데스크톱: 우측 사이드바 (검색 아래) */
      md:bottom-auto md:top-20 md:right-4 md:left-auto md:w-96 md:max-h-[calc(100vh-6rem)]
    `}>
      {/* 드래그 핸들 (모바일) */}
      <div className="flex justify-center pt-2 md:hidden">
        <div className="w-10 h-1 bg-slate-600 rounded-full" />
      </div>

      {/* 닫기 버튼 */}
      <button
        onClick={() => setIsPanelOpen(false)}
        className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors p-1"
        aria-label="패널 닫기"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      <div className="p-4 space-y-4">
        {/* 로딩 상태 */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
            <span className="ml-3 text-slate-400">날씨 정보 로딩 중...</span>
          </div>
        )}

        {/* 에러 상태 */}
        {error && (
          <div className="text-center py-8">
            <p className="text-red-400 text-sm">{error}</p>
            <p className="text-slate-500 text-xs mt-1">잠시 후 다시 시도해주세요.</p>
          </div>
        )}

        {/* 현재 날씨 */}
        {currentWeather && !isLoading && (
          <CurrentWeather weather={currentWeather} locationName={locationName} />
        )}

        {/* 오늘 상세 정보 */}
        {dailyForecast.length > 0 && !isLoading && (
          <WeatherDetails forecast={dailyForecast[0]} />
        )}

        {/* 일별 예보 */}
        {dailyForecast.length > 0 && !isLoading && (
          <ForecastList forecasts={dailyForecast} />
        )}
      </div>
    </div>
  );
};

export default WeatherPanel;
