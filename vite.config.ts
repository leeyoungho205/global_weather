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
  // 개발 서버에서 GDACS(CORS 미허용) 프록시 → /gdacs/* 를 GDACS로 전달.
  // GDACS WAF가 Origin/Referer 붙은 요청을 거부하므로 해당 헤더를 제거하고 깨끗한 UA 사용.
  server: {
    proxy: {
      '/gdacs': {
        target: 'https://www.gdacs.org/gdacsapi',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gdacs/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
            proxyReq.removeHeader('cookie');
            proxyReq.setHeader('user-agent', 'curl/8.0');
          });
        },
      },
    },
  },
})
