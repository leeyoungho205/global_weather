import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite 설정 - Global Earth 날씨 앱
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  // 개발 서버 프록시: NRL·NHC 태풍 데이터는 CORS를 허용하지 않는다.
  // 운영에서는 vercel.json의 rewrites가 같은 역할을 한다.
  server: {
    proxy: {
      '/tcdata/sector': {
        target: 'https://science.nrlmry.navy.mil',
        changeOrigin: true,
        rewrite: () => '/geoips/tcdat/sectors/atcf_sector_file',
      },
      '/tcdata/btk': {
        target: 'https://ftp.nhc.noaa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tcdata\/btk/, '/atcf/btk'),
      },
    },
  },
})
