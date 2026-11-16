// 지구본에 보여 줄 도시·나라 이름 목록 (Globe View 2D 앱과 같은 목록)
// minZoom: 2D 지도 기준 확대 단계 (3D에서는 카메라 높이로 바꿔 씁니다). rank: 숫자가 작을수록 먼저 자리를 차지합니다.
// [이름, 나라 주소, 도시 주소, 위도, 경도, minZoom, rank, 영어 이름]
const rawCities: [string, string, string, number, number, number, number, string][] = [
  ['서울', 'south-korea', 'seoul', 37.566, 126.978, 3, 1, 'Seoul'],
  ['평양시', 'north-korea', 'pyongyang', 39.039, 125.762, 4, 2, 'Pyongyang'],
  ['부산', 'south-korea', 'busan', 35.18, 129.075, 4, 2, 'Busan'],
  ['광주', 'south-korea', 'gwangju', 35.16, 126.852, 5, 3, 'Gwangju'],
  ['제주시', 'south-korea', 'jeju-si', 33.5, 126.531, 5, 3, 'Jeju'],
  ['베이징 시', 'china', 'beijing', 39.904, 116.407, 3, 1, 'Beijing'],
  ['상하이', 'china', 'shanghai', 31.23, 121.474, 3, 1, 'Shanghai'],
  ['홍콩', 'china', 'hong-kong', 22.32, 114.17, 4, 2, 'Hong Kong'],
  ['타이베이시', 'taiwan', 'taipei', 25.033, 121.565, 4, 2, 'Taipei'],
  ['가오슝시', 'taiwan', 'kaohsiung', 22.627, 120.301, 5, 3, 'Kaohsiung'],
  ['시안시', 'china', 'xi-an', 34.341, 108.94, 4, 2, "Xi'an"],
  ['선양시', 'china', 'shenyang', 41.805, 123.431, 4, 2, 'Shenyang'],
  ['우한시', 'china', 'wuhan', 30.593, 114.305, 4, 2, 'Wuhan'],
  ['허페이시', 'china', 'hefei', 31.82, 117.227, 5, 3, 'Hefei'],
  ['원저우시', 'china', 'wenzhou', 27.994, 120.699, 5, 3, 'Wenzhou'],
  ['제양시', 'china', 'jieyang', 23.55, 116.372, 5, 3, 'Jieyang'],
  ['이춘시', 'china', 'yichun', 27.815, 114.416, 5, 3, 'Yichun'],
  ['Guiyang', 'china', 'guiyang', 26.647, 106.63, 5, 3, 'Guiyang'],
  ['청두', 'china', 'chengdu', 30.659, 104.066, 4, 2, 'Chengdu'],
  ['난닝시', 'china', 'nanning', 22.817, 108.366, 5, 3, 'Nanning'],
  ['사오양시', 'china', 'shaoyang', 27.24, 111.468, 5, 4, 'Shaoyang'],
  ['창더시', 'china', 'changde', 29.031, 111.698, 5, 4, 'Changde'],
  ['Dazhou', 'china', 'dazhou', 31.209, 107.468, 5, 4, 'Dazhou'],
  ['구이린시', 'china', 'guilin', 25.274, 110.29, 5, 4, 'Guilin'],
  ['Liangshan', 'china', 'liangshan', 27.882, 102.267, 5, 4, 'Liangshan'],
  ['Honghe', 'china', 'honghe', 23.364, 103.374, 5, 4, 'Honghe'],
  ['스자좡', 'china', 'shijiazhuang', 38.042, 114.515, 5, 3, 'Shijiazhuang'],
  ['웨이팡', 'china', 'weifang', 36.707, 119.162, 5, 4, 'Weifang'],
  ['저우커우시', 'china', 'zhoukou', 33.625, 114.649, 5, 4, 'Zhoukou'],
  ['Xinxiang', 'china', 'xinxiang', 35.303, 113.927, 5, 4, 'Xinxiang'],
  ['화이안시', 'china', 'huai-an', 33.61, 119.015, 5, 4, "Huai'an"],
  ['하얼빈시', 'china', 'harbin', 45.803, 126.535, 4, 2, 'Harbin'],
  ['Qiqihar', 'china', 'qiqihar', 47.354, 123.918, 5, 3, 'Qiqihar'],
  ['청진시', 'north-korea', 'chongjin', 41.796, 129.776, 5, 3, 'Chongjin'],
  ['도쿄도', 'japan', 'tokyo', 35.68, 139.69, 3, 1, 'Tokyo'],
  ['오사카시', 'japan', 'osaka', 34.694, 135.502, 4, 2, 'Osaka'],
  ['후쿠오카시', 'japan', 'fukuoka', 33.59, 130.402, 4, 2, 'Fukuoka'],
  ['가고시마시', 'japan', 'kagoshima', 31.597, 130.557, 5, 3, 'Kagoshima'],
  ['센다이시', 'japan', 'sendai', 38.268, 140.87, 5, 3, 'Sendai'],
  ['가나자와시', 'japan', 'kanazawa', 36.561, 136.656, 5, 3, 'Kanazawa'],
  ['삿포로시', 'japan', 'sapporo', 43.062, 141.354, 4, 2, 'Sapporo'],
  ['왓카나이시', 'japan', 'wakkanai', 45.415, 141.673, 5, 4, 'Wakkanai'],
  ['블라디보스토크', 'russia', 'vladivostok', 43.116, 131.882, 4, 2, 'Vladivostok'],
  ['하바롭스크', 'russia', 'khabarovsk', 48.48, 135.072, 4, 2, 'Khabarovsk'],
  ['유즈노사할린스크', 'russia', 'yuzhno-sakhalinsk', 46.959, 142.738, 5, 3, 'Yuzhno-Sakhalinsk'],
  ['Sovetskaya Gavan’', 'russia', 'sovetskaya-gavan', 48.967, 140.285, 5, 4, 'Sovetskaya Gavan'],
  ['울란바토르', 'mongolia', 'ulaanbaatar', 47.886, 106.906, 3, 1, 'Ulaanbaatar'],
  ['이르쿠츠크', 'russia', 'irkutsk', 52.287, 104.305, 4, 2, 'Irkutsk'],
  ['울란우데', 'russia', 'ulan-ude', 51.834, 107.584, 5, 3, 'Ulan-Ude'],
  ['치타', 'russia', 'chita', 52.034, 113.5, 5, 3, 'Chita'],
  ['아바칸', 'russia', 'abakan', 53.721, 91.442, 5, 3, 'Abakan'],
  ['키질', 'russia', 'kyzyl', 51.719, 94.437, 5, 3, 'Kyzyl'],
  ['페트로파블롭스크캄차츠키', 'russia', 'petropavlovsk-kamchatsky', 53.024, 158.643, 4, 3, 'Petropavlovsk-Kamchatsky'],
  ['Mil’kovo', 'russia', 'milkovo', 54.697, 158.621, 5, 4, 'Milkovo'],
  ['방콕', 'thailand', 'bangkok', 13.756, 100.502, 3, 1, 'Bangkok'],
  ['네피도', 'myanmar', 'naypyidaw', 19.763, 96.079, 4, 2, 'Naypyidaw'],
  ['양곤', 'myanmar', 'yangon', 16.866, 96.195, 4, 2, 'Yangon'],
  ['하노이', 'vietnam', 'hanoi', 21.028, 105.854, 3, 1, 'Hanoi'],
  ['비엔티안', 'laos', 'vientiane', 17.975, 102.633, 4, 2, 'Vientiane'],
  ['마닐라', 'philippines', 'manila', 14.6, 120.984, 3, 1, 'Manila'],
  ['Sri Vijaya Puram', 'india', 'sri-vijaya-puram', 11.623, 92.726, 5, 4, 'Sri Vijaya Puram'],
  // 몽골을 자세히 볼 때(확대 6 이상) 보이는 도시들
  ['Darkhan', 'mongolia', 'darkhan', 49.487, 105.95, 6, 5, 'Darkhan'],
  ['Erdenet', 'mongolia', 'erdenet', 49.028, 104.044, 6, 5, 'Erdenet'],
  ['Zuunkharaa', 'mongolia', 'zuunkharaa', 48.856, 106.856, 7, 6, 'Zuunkharaa'],
  ['Baganuur', 'mongolia', 'baganuur', 47.785, 108.369, 7, 6, 'Baganuur'],
  ['Tsetserleg', 'mongolia', 'tsetserleg', 47.475, 101.454, 6, 5, 'Tsetserleg'],
  ['Bayankhongor', 'mongolia', 'bayankhongor', 46.194, 100.718, 6, 5, 'Bayankhongor'],
  ['Arvaikheer', 'mongolia', 'arvaikheer', 46.263, 102.775, 6, 5, 'Arvaikheer'],
  ['Undurkhaan', 'mongolia', 'undurkhaan', 47.319, 110.656, 6, 5, 'Undurkhaan'],
  ['Sainshand', 'mongolia', 'sainshand', 44.892, 110.14, 6, 5, 'Sainshand'],
  ['Choibalsan', 'mongolia', 'choibalsan', 48.07, 114.53, 6, 5, 'Choibalsan'],
  ['Kyakhta', 'russia', 'kyakhta', 50.356, 106.452, 6, 5, 'Kyakhta'],
  // 그 밖의 세계 주요 도시 (멀리서 볼 때)
  ['뉴델리', 'india', 'new-delhi', 28.614, 77.209, 3, 1, 'New Delhi'],
  ['뭄바이', 'india', 'mumbai', 19.076, 72.878, 3, 2, 'Mumbai'],
  ['싱가포르', 'singapore', 'singapore', 1.352, 103.82, 3, 1, 'Singapore'],
  ['자카르타', 'indonesia', 'jakarta', -6.208, 106.846, 3, 1, 'Jakarta'],
  ['시드니', 'australia', 'sydney', -33.869, 151.209, 3, 1, 'Sydney'],
  ['모스크바', 'russia', 'moscow', 55.756, 37.617, 3, 1, 'Moscow'],
  ['런던', 'united-kingdom', 'london', 51.507, -0.128, 3, 1, 'London'],
  ['파리', 'france', 'paris', 48.857, 2.352, 3, 1, 'Paris'],
  ['카이로', 'egypt', 'cairo', 30.044, 31.236, 3, 1, 'Cairo'],
  ['뉴욕', 'united-states', 'new-york', 40.713, -74.006, 3, 1, 'New York'],
  ['로스앤젤레스', 'united-states', 'los-angeles', 34.052, -118.244, 3, 1, 'Los Angeles'],
  ['호놀룰루', 'united-states', 'honolulu', 21.307, -157.858, 3, 2, 'Honolulu'],
];

// 나라·지역 이름 (점 없이 글자만)
const rawCountries: [string, number, number, number][] = [
  ['몽골', 46.94, 102.98, 3],
  ['중화인민공화국', 33.4, 100.6, 3],
  ['방글라데시', 23.8, 90.3, 4],
  ['미얀마', 21.6, 95.9, 4],
  ['부탄', 27.4, 90.5, 5],
  ['태국', 15.6, 101.0, 4],
  ['베트남', 15.0, 108.2, 4],
  ['캄보디아', 12.6, 104.9, 4],
  ['라오스', 19.6, 102.4, 4],
  ['필리핀', 12.4, 122.6, 4],
  ['괌', 13.45, 144.78, 5],
  ['북마리아나 제도', 16.6, 145.7, 5],
  ['러시아', 60.0, 100.0, 2],
  ['인도', 22.5, 79.0, 3],
  ['오스트레일리아', -25.0, 134.0, 2],
];

// 장소 하나 (도시, 검색 결과, 지구본을 누른 곳 모두 이 모양)
export interface Place {
  key: string; // 저장·비교용 고유 값
  name: string; // 보여 줄 이름
  sub?: string; // 보조 이름 (영어 이름, 나라 등)
  lat: number;
  lng: number;
}

export interface CityLabel extends Place {
  kind: 'city' | 'country';
  minZoom: number;
  rank: number;
}

export const cities: CityLabel[] = rawCities.map(([name, , slug, lat, lng, minZoom, rank, en]) => ({
  kind: 'city',
  key: `city:${slug}`,
  name,
  sub: en,
  lat,
  lng,
  minZoom,
  rank,
}));

export const countries: CityLabel[] = rawCountries.map(([name, lat, lng, minZoom]) => ({
  kind: 'country',
  key: `country:${name}`,
  name,
  lat,
  lng,
  minZoom,
  rank: 0,
}));

// 검색어로 도시 찾기 (한글 이름, 영어 이름 모두)
export const searchCities = (query: string): Place[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return cities
    .filter((city) => city.name.toLowerCase().includes(q) || (city.sub ?? '').toLowerCase().includes(q))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 8);
};
