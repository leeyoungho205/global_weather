// 지구본 위에 열리는 창(패널)들 — Globe View 2D 앱과 같은 모양
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon, LogoMark, WeatherIcon } from './Icons';
import { FORECAST, LIVE, OVERLAY_ITEMS, categoryOf, type LayerCategory } from './layers';
import type { LayerType, Overlays } from '../../types/map';
import type { Settings } from '../../store/mapStore';
import { searchCities, type Place } from '../../data/places';
import { searchLocation } from '../../services/geocodingApi';
import { STAGES, type Storm } from '../../services/stormsApi';
import { useWeather } from '../../hooks/useWeather';
import { useDebounce } from '../../hooks/useDebounce';
import { getWeatherInfo, getWindDirection } from '../../utils/weatherCodes';
import { clockParts, formatNumber, iconForCode } from '../../utils/format';

// 패널 오른쪽 위의 닫기(X) 버튼
function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="close" aria-label="닫기" onClick={onClick}>
      <span>
        <Icon name="close" size={16} />
      </span>
    </button>
  );
}

// ── 환영 창 ───────────────────────────────────────────
export function WelcomeDialog({ onClose, onLocate, onSearch, locating }: {
  onClose: () => void;
  onLocate: () => void;
  onSearch: () => void;
  locating: boolean;
}) {
  return (
    <aside className="panel dialog welcome">
      <CloseButton onClick={onClose} />
      <div className="title-logo">
        <span className="logo-wrap">
          <LogoMark size={76} />
        </span>
        <div className="title-logo-text">
          <strong>GLOBE</strong>
          <span>VIEW</span>
        </div>
      </div>
      <p>환영합니다! 지구본을 돌려 보거나 현재 위치를 찾아보세요.</p>
      <button type="button" className="dialog accent" onClick={onLocate}>
        <span className="btn-icon">
          <Icon name="locate" size={20} />
        </span>
        <span className="text">{locating ? '찾는 중…' : '현재 위치 표시'}</span>
      </button>
      <button type="button" className="dialog" onClick={onSearch}>
        <span className="btn-icon">
          <Icon name="search" size={22} />
        </span>
        <span className="text">검색…</span>
      </button>
    </aside>
  );
}

// ── 지도 종류 고르기 (실시간: 위성·레이더 / 예보: 바람·기온) ─────────
export function LayersPanel({ layer, onSelect, onCollapse }: {
  layer: LayerType;
  onSelect: (layer: LayerType) => void;
  onCollapse: () => void;
}) {
  const renderGroup = (list: LayerCategory[]) =>
    list.map((category) => (
      <div key={category.id} className="category-wrap">
        <button
          type="button"
          className={`menu-item category${category.id === layer ? ' selected' : ''}`}
          aria-pressed={category.id === layer}
          onClick={() => onSelect(category.id)}
        >
          <span className="menu-icon">
            <Icon name={category.icon} />
          </span>
          <span className="text">{category.label}</span>
        </button>
      </div>
    ));
  return (
    <nav className="panel layers" aria-label="실시간 지도, 예보 지도">
      <div className="live">
        <h4>
          실시간 지도
          <button type="button" className="collapse" aria-label="접기" onClick={onCollapse}>
            <Icon name="chevronUp" size={16} />
          </button>
        </h4>
        {renderGroup(LIVE)}
      </div>
      <div className="forecast">
        <h4>예보 지도</h4>
        {renderGroup(FORECAST)}
      </div>
    </nav>
  );
}

// 중간 폭 화면에서 쓰는 "위성 ▾" 버튼
export function LayersDropdown({ layer, onClick }: { layer: LayerType; onClick: () => void }) {
  const category = categoryOf(layer);
  return (
    <button type="button" className="layers-dropdown" aria-label="실시간 지도, 예보 지도" onClick={onClick}>
      <span className="menu-icon">
        <Icon name={category.icon} />
      </span>
      <span className="text">{category.label}</span>
      <span className="arrow">
        <Icon name="chevronDown" size={14} />
      </span>
    </button>
  );
}

// ── 시계 (위성 사진 시각) ──────────────────────────────
// 위·아래 화살표로 날짜(하루)·시(1시간)·분(10분) 단위로 거슬러 갈 수 있습니다
export function ClockPanel({ time, settings, playing, onPlay, onStep, isLatest }: {
  time: Date;
  settings: Settings;
  playing: boolean;
  onPlay: () => void;
  onStep: (minutes: number) => void;
  isLatest: boolean;
}) {
  const parts = clockParts(time, { utc: settings.timeZone === 'utc', hour12: settings.timeFormat === 'hour12' });
  const arrow = (dir: 'up' | 'down', unit: number) => (
    <button
      type="button"
      className={dir}
      aria-label={dir === 'up' ? '다음' : '이전'}
      disabled={dir === 'up' && isLatest}
      onClick={() => onStep(unit * (dir === 'up' ? 1 : -1))}
    >
      <span>
        <Icon name={dir === 'up' ? 'chevronUp' : 'chevronDown'} size={14} />
      </span>
    </button>
  );
  return (
    <div className={`panel clock${settings.timeFormat === 'hour12' ? ' hour12' : ''}`}>
      <button type="button" className="play" aria-label={playing ? '애니메이션 일시 중지' : '애니메이션 재생'} onClick={onPlay}>
        <span>
          <Icon name={playing ? 'pause' : 'play'} size={22} />
        </span>
      </button>
      <div className="date">
        {arrow('up', 1440)}
        <div className="text">
          {parts.month} <b>{parts.day}</b>
        </div>
        {arrow('down', 1440)}
      </div>
      <div className="hour">
        {arrow('up', 60)}
        <div className="text">{parts.hour}</div>
        {arrow('down', 60)}
      </div>
      <div className={`text colon${isLatest && !playing ? ' blink' : ''}`}>:</div>
      <div className="minute">
        {arrow('up', 10)}
        <div className="text">{parts.minute}</div>
        {arrow('down', 10)}
      </div>
      {parts.ampm && <div className="text ampm">{parts.ampm}</div>}
      <button type="button" className="recent" aria-label="최근 시간" disabled={isLatest} onClick={() => onStep(0)}>
        <span>
          <Icon name="recent" size={18} />
        </span>
      </button>
    </div>
  );
}

// ── 검색 ───────────────────────────────────────────────
// 기본 도시 목록에서 먼저 찾고, 전 세계 지명은 Open-Meteo 지명 검색으로 찾습니다
export function SearchPanel({ onClose, onPick, onPickStorm, onLocate, locating, storms, stormStatus, savedPlaces }: {
  onClose: () => void;
  onPick: (place: Place) => void;
  onPickStorm: (storm: Storm) => void;
  onLocate: () => void;
  locating: boolean;
  storms: Storm[];
  stormStatus: 'loading' | 'ok' | 'error';
  savedPlaces: Place[];
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const debounced = useDebounce(query.trim(), 350);
  const remote = useQuery({
    queryKey: ['geocoding', debounced],
    queryFn: () => searchLocation(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60 * 60000,
  });
  const local = searchCities(query);
  // 같은 곳이 두 번 나오지 않도록 (기본 목록에 있는 도시는 빼고) 합칩니다
  const remotePlaces: Place[] = (remote.data ?? [])
    .map((r) => ({
      key: `geo:${r.id}`,
      name: r.name,
      sub: [r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lng: r.longitude,
    }))
    .filter((p) => !local.some((c) => Math.abs(c.lat - p.lat) < 0.2 && Math.abs(c.lng - p.lng) < 0.2));
  const results = query.trim() ? [...local, ...remotePlaces] : [];
  const q = query.trim().toLowerCase();
  const activeStorms = storms.filter((s) => !q || s.name.toLowerCase().includes(q));
  const searching = remote.isFetching || (query.trim().length >= 2 && debounced !== query.trim());
  return (
    <aside className="panel side search">
      <header>
        <h3>검색</h3>
        <CloseButton onClick={onClose} />
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0]) onPick(results[0]);
        }}
      >
        <span className="input-icon">
          <Icon name="search" size={18} />
        </span>
        <input
          ref={inputRef}
          name="q"
          type="search"
          placeholder="장소나 폭풍 찾기…"
          aria-label="검색"
          maxLength={255}
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>
      <button type="button" className="dialog geolocation-search" onClick={onLocate}>
        <span className="btn-icon">
          <Icon name="locate" size={18} />
        </span>
        <span className="text">{locating ? '찾는 중…' : '현재 위치 표시'}</span>
      </button>
      <div className="results">
        {!query && savedPlaces.length > 0 && (
          <>
            <h4>저장한 장소</h4>
            <ul>
              {savedPlaces.map((place) => (
                <li key={place.key}>
                  <button type="button" onClick={() => onPick(place)}>
                    <span className="saved-star">
                      <Icon name="star" size={16} />
                    </span>
                    <span className="result-name">{place.name}</span>
                    <span className="result-sub">{place.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {query && results.length === 0 && (
          <p className="empty">{searching ? '찾는 중…' : '일치하는 장소가 없습니다'}</p>
        )}
        {results.length > 0 && (
          <>
            <h4>장소</h4>
            <ul>
              {results.map((place) => (
                <li key={place.key}>
                  <button type="button" onClick={() => onPick(place)}>
                    <span className="result-name">{place.name}</span>
                    <span className="result-sub">{place.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {!query && activeStorms.length === 0 && (
          <>
            <h4>열대 시스템</h4>
            <p className="empty">
              {stormStatus === 'loading' && '진행 중인 열대 저기압을 확인하는 중…'}
              {stormStatus === 'ok' && '지금 진행 중인 열대 저기압이 없습니다'}
              {stormStatus === 'error' && '열대 저기압 정보를 받지 못했습니다'}
            </p>
          </>
        )}
        {activeStorms.length > 0 && (
          <>
            <h4>열대 시스템</h4>
            <ul>
              {activeStorms.map((storm) => (
                <li key={storm.id}>
                  <button type="button" onClick={() => onPickStorm(storm)}>
                    <span className={`mini-storm rank${Math.max(0, storm.rank)}`} />
                    <span className="result-name">{storm.name}</span>
                    <span className="result-sub">{storm.maxWind}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}

// ── 설정 ───────────────────────────────────────────────
function Segmented<T extends string>({ name, value, options, onChange }: {
  name: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([id, label]) => (
        <label key={id} className={value === id ? 'checked' : ''}>
          <input type="radio" name={name} value={id} checked={value === id} onChange={() => onChange(id)} />
          {label}
        </label>
      ))}
    </div>
  );
}

export function SettingsPanel({ settings, onChange, onClose }: {
  settings: Settings;
  onChange: (change: Partial<Settings>) => void;
  onClose: () => void;
}) {
  const row = <K extends keyof Settings>(key: K, label: string, options: [Settings[K], string][]) => (
    <div className="bar2">
      <p>{label}</p>
      <Segmented name={key} value={settings[key]} options={options} onChange={(v) => onChange({ [key]: v } as Partial<Settings>)} />
    </div>
  );
  return (
    <aside className="panel side settings">
      <header>
        <span className="header-icon">
          <Icon name="settings" size={22} />
        </span>
        <h3>설정</h3>
        <CloseButton onClick={onClose} />
      </header>
      <div className="scroll">
        <h4>시각</h4>
        <section className="bubble">
          {row('timeZone', '시간대', [['local', '현지'], ['utc', 'UTC']])}
          {row('timeFormat', '시간 형식', [['hour12', '12시간'], ['hour24', '24시간']])}
        </section>
        <h4>화면</h4>
        <section className="bubble">
          {row('appearance', '외관', [['translucent', '반투명'], ['opaque', '불투명']])}
          {row('units', '단위', [['metric', '°C · km'], ['imperial', '°F · mi']])}
        </section>
      </div>
    </aside>
  );
}

// ── 정보 ───────────────────────────────────────────────
export function AboutPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside className="panel side about">
      <header>
        <span className="header-icon">
          <Icon name="about" size={22} />
        </span>
        <h3>정보</h3>
        <CloseButton onClick={onClose} />
      </header>
      <div className="scroll">
        <div className="about-logo">
          <LogoMark size={56} />
          <div className="title-logo-text small">
            <strong>GLOBE</strong>
            <span>VIEW</span>
          </div>
        </div>
        <p>지구 전체의 구름, 비, 바람, 기온을 3D 지구본 위에서 한눈에 볼 수 있는 인터랙티브 날씨 지도입니다.</p>
        <p>지구본을 끌어서 돌리고, 마우스 휠이나 두 손가락으로 확대해 보세요. 아무 곳이나 누르면 그곳의 날씨와 예보가 열립니다.</p>
        <p className="note">
          자료 출처: 위성 구름 NASA GIBS (Himawari·GOES·VIIRS), 바닥 지구 사진 NASA Blue Marble, 레이더 RainViewer,
          예보·기온·바람 Open-Meteo, 열대 저기압 GDACS, 고온 지점 NASA VIIRS.
        </p>
      </div>
    </aside>
  );
}

// ── 지도 오버레이 목록 ────────────────────────────────
export function OverlaysPanel({ overlays, onToggle }: { overlays: Overlays; onToggle: (key: keyof Overlays) => void }) {
  return (
    <nav className="panel overlays-panel" aria-label="지도 오버레이">
      <h4>지도 오버레이</h4>
      {OVERLAY_ITEMS.map(([key, label, icon, hotkey]) => (
        <label key={key} className={`menu-item check${overlays[key] ? ' on' : ''}`}>
          <input type="checkbox" checked={overlays[key]} onChange={() => onToggle(key)} />
          <span className="menu-icon">
            <Icon name={icon} />
          </span>
          <span className="text">{label}</span>
          <kbd className="hotkey">{hotkey}</kbd>
        </label>
      ))}
    </nav>
  );
}

// ── 로고를 눌렀을 때 나오는 메뉴 ───────────────────────
export type TitleMenuKey = 'settings' | 'about' | 'share' | 'distance' | 'area';
export function TitleMenu({ onSelect }: { onSelect: (key: TitleMenuKey) => void }) {
  const items: [TitleMenuKey, string, 'settings' | 'about' | 'share' | 'distance' | 'area'][] = [
    ['settings', '설정', 'settings'],
    ['about', '정보', 'about'],
    ['share', '공유', 'share'],
    ['distance', '거리 측정', 'distance'],
    ['area', '지역 측정', 'area'],
  ];
  return (
    <nav className="panel title-menu">
      <h1>Globe View</h1>
      {items.map(([key, label, icon]) => (
        <button key={key} type="button" className="menu-item" onClick={() => onSelect(key)}>
          <span className="menu-icon">
            <Icon name={icon} size={20} />
          </span>
          <span className="text">{label}</span>
        </button>
      ))}
    </nav>
  );
}

// ── 장소 날씨 (지금 날씨 + 7일 예보) ───────────────────
const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export function WeatherPanel({ place, units, onClose, saved, onToggleSave }: {
  place: Place;
  units: Settings['units'];
  onClose: () => void;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const { currentWeather: now, dailyForecast, isLoading, error, refetch } = useWeather(place.lat, place.lng);
  const days = dailyForecast.slice(0, 7);
  const imperial = units === 'imperial';
  const toUnit = (c: number) => Math.round(imperial ? (c * 9) / 5 + 32 : c);
  const fmt = (c: number) => `${toUnit(c) < 0 ? '−' : ''}${Math.abs(toUnit(c))}°`;
  const speed = (kmh: number) => (imperial ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`);
  const lo = Math.min(...days.map((d) => d.tempMin));
  const hi = Math.max(...days.map((d) => d.tempMax));
  const dayLabel = (date: string, i: number) => {
    if (i === 0) return '오늘';
    // "2026-11-16" 은 그곳의 날짜이므로, 요일도 그 날짜로 계산합니다
    const [y, m, d] = date.split('-').map(Number);
    return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  };
  return (
    <aside className="panel weather">
      <header>
        <button type="button" className={`save${saved ? ' saved' : ''}`} aria-label="즐겨찾기" aria-pressed={saved} onClick={onToggleSave}>
          <Icon name="star" size={22} />
        </button>
        <h2>{place.name}</h2>
        <CloseButton onClick={onClose} />
      </header>
      {now && (
        <div className="now">
          <span className="now-icon">
            <WeatherIcon kind={iconForCode(now.weatherCode)} />
          </span>
          <span className="now-temp">{fmt(now.temperature)}</span>
          <span className="now-text">
            <b>{getWeatherInfo(now.weatherCode).description}</b>
            <span>체감 {fmt(now.feelsLike)}</span>
          </span>
          <dl className="now-details">
            <dt>바람</dt>
            <dd>
              {getWindDirection(now.windDirection)} {speed(now.windSpeed)}
            </dd>
            <dt>습도</dt>
            <dd>{Math.round(now.humidity)}%</dd>
            <dt>기압</dt>
            <dd>{formatNumber(now.pressure)} hPa</dd>
            <dt>강수</dt>
            <dd>{now.precipitation.toFixed(1)} mm</dd>
          </dl>
        </div>
      )}
      {days.length > 0 && (
        <table>
          <thead>
            <tr>
              <th className="day">날</th>
              <th />
              <th className="num">최저</th>
              <th className="bar-head">기온</th>
              <th className="num">최고</th>
            </tr>
            <tr className="sub">
              <th className="day" />
              <th />
              <th />
              <th />
              <th className="num">{imperial ? '°F' : '°C'}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, i) => {
              const left = ((day.tempMin - lo) / Math.max(1, hi - lo)) * 100;
              const width = ((day.tempMax - day.tempMin) / Math.max(1, hi - lo)) * 100;
              return (
                <tr key={day.date}>
                  <td className="day">{dayLabel(day.date, i)}</td>
                  <td className="cond" title={`${getWeatherInfo(day.weatherCode).description} · 강수 확률 ${day.precipitationProbMax ?? 0}%`}>
                    <WeatherIcon kind={iconForCode(day.weatherCode)} />
                  </td>
                  <td className="num min">{fmt(day.tempMin)}</td>
                  <td className="bar">
                    <div className="track">
                      <div className="range" style={{ left: `${left}%`, width: `${width}%` }} />
                    </div>
                  </td>
                  <td className="num max">{fmt(day.tempMax)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {isLoading && <p className="note">예보를 받아 오는 중…</p>}
      {error && (
        <p className="note">
          예보를 받지 못했습니다. 인터넷 연결을 확인해 주세요.{' '}
          <button type="button" className="link" onClick={() => refetch()}>
            다시 시도
          </button>
        </p>
      )}
      {now && <p className="note source">예보: Open-Meteo</p>}
    </aside>
  );
}

// ── 태풍 정보 ──────────────────────────────────────────
export function StormPanel({ storm, onClose }: { storm: Storm; onClose: () => void }) {
  const updated =
    storm.updated && !Number.isNaN(storm.updated.getTime())
      ? storm.updated.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '—';
  return (
    <aside className="panel weather storm">
      <header>
        <span className={`mini-storm rank${Math.max(0, storm.rank)}`} />
        <h2>{storm.name}</h2>
        <CloseButton onClick={onClose} />
      </header>
      <dl>
        <dt>지금 등급</dt>
        <dd>{storm.category}</dd>
        <dt>가장 강했을 때 풍속</dt>
        <dd>{storm.maxWind}</dd>
        <dt>마지막 관측</dt>
        <dd>{updated}</dd>
      </dl>
      <div className="track-legend">
        {Object.entries(STAGES).map(([key, stage]) => (
          <span key={key}>
            <i style={{ backgroundColor: stage.color }} />
            {stage.label}
          </span>
        ))}
      </div>
      <p className="note">
        출처: GDACS (JTWC·NOAA 등의 공식 예보). 실선은 지나온 길, 점선은 예상 진로, 회색 영역은 예상 진로의 범위입니다.
        {storm.report && (
          <>
            {' '}
            <a href={storm.report} target="_blank" rel="noreferrer">
              자세한 보고서
            </a>
          </>
        )}
      </p>
    </aside>
  );
}

// ── 고온 지점(화재) 안내 ───────────────────────────────
// 처음 켤 때 한 번 설명을 보여 주고 동의하면 켭니다
export function HeatConsent({ open, onAccept, onCancel }: { open: boolean; onAccept: () => void; onCancel: () => void }) {
  return (
    <aside className="panel heat-consent" style={{ display: open ? 'block' : 'none' }}>
      <h3>고온 지점</h3>
      <p>위성이 감지한 뜨거운 지점을 보여 줍니다. 산불, 공장, 화산일 수 있으며 실제 화재가 아닐 수도 있어요.</p>
      <button type="button" className="dialog" onClick={onAccept}>
        <span className="text">고온 지점 보기</span>
      </button>
      <button type="button" className="dialog later" onClick={onCancel}>
        <span className="text">취소</span>
      </button>
    </aside>
  );
}

// ── 거리/넓이 측정 ─────────────────────────────────────
export function MeasurePanel({ mode, value, count, miles, onCancel, onUndo, onDone }: {
  mode: 'distance' | 'area';
  value: number;
  count: number;
  miles: boolean;
  onCancel: () => void;
  onUndo: () => void;
  onDone: () => void;
}) {
  // value: 거리는 km, 넓이는 km²
  const shown = mode === 'area' ? value * (miles ? 0.386102 : 1) : value * (miles ? 0.621371 : 1);
  const unit = mode === 'area' ? (miles ? 'mi²' : 'km²') : miles ? 'mi' : 'km';
  return (
    <div className="panel measure">
      <h4>{mode === 'area' ? '지역 측정' : '거리 측정'}</h4>
      <p>
        {count === 0
          ? '포인트를 추가하려면 지구본을 클릭하세요.'
          : `${mode === 'distance' && shown < 10 ? shown.toFixed(2) : formatNumber(shown)} ${unit}`}
      </p>
      <div className="actions">
        <button type="button" className="dialog" onClick={onCancel}>
          <span className="text">취소</span>
        </button>
        <button type="button" className="dialog" onClick={onUndo} disabled={!count}>
          <span className="text">실행 취소</span>
        </button>
        <button type="button" className="dialog accent" onClick={onDone}>
          <span className="text">완료</span>
        </button>
      </div>
    </div>
  );
}

// ── 예보 지도 색 막대 (기온, 바람) — 지구본에 칠한 색(weatherGrid.ts의 RAMPS)과 같은 색 ──
const LEGENDS: Partial<Record<LayerType, [string, string[]]>> = {
  temperature: [
    'linear-gradient(90deg, #7828a0, #3c46c8, #3ca0e6, #46c8aa, #8cd250, #f0d23c, #f58228, #c82832)',
    ['−40°', '0°', '20°', '40°C'],
  ],
  wind: ['linear-gradient(90deg, #283c8c, #2882be, #3cbe96, #c8d246, #f07828, #c82878)', ['0', '20', '50', '80 km/h']],
};

export function Legend({ layer }: { layer: LayerType }) {
  const legend = LEGENDS[layer];
  if (!legend) return <div className="legend none" />;
  return (
    <div className="legend" style={{ backgroundImage: legend[0] }}>
      {legend[1].map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}
