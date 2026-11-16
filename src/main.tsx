// 앱의 시작점: 글꼴과 스타일을 불러오고 App을 화면에 붙입니다
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/nunito-sans/500.css';
import '@fontsource/nunito-sans/700.css';
import '@fontsource/nunito-sans/900.css';
import './index.css';
import './globeview.css';
import App from './App';

// 터치 기기인지 표시 (마우스 전용 효과(hover)를 끄기 위해)
document.body.classList.add(window.matchMedia('(hover: none)').matches ? 'touch' : 'no-touch');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
