import type { Config } from 'tailwindcss';

/** KB 브랜드 색을 토큰으로 고정한다. 화면마다 hex를 적으면 곧 달라진다. */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kb: {
          yellow: '#FFBC00',
          yellowSoft: '#FFD35C',
          // v0 계열로 전면 개편 — 갈색 톤을 버리고 뉴트럴 블랙.
          // 따뜻한 갈색은 아늑했지만 '제품'보다 '카페 홈페이지'로 읽혔습니다.
          // 검정에 가까운 중립 배경 + 액센트 하나가 그 계열의 문법입니다.
          brown: '#26262B',
          brownDeep: '#18181B',
          ink: '#0A0A0B',
        },
        glass: 'rgba(255,255,255,0.06)',
      },
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', '-apple-system',
               'BlinkMacSystemFont', 'Apple SD Gothic Neo', 'Malgun Gothic',
               'sans-serif'],
      },
      boxShadow: {
        glass: '0 1px 0 rgba(255,255,255,.08) inset, 0 18px 48px rgba(0,0,0,.34)',
        glow: '0 0 0 1px rgba(255,188,0,.30), 0 12px 40px rgba(255,188,0,.16)',
      },
      backgroundImage: {
        honey: 'radial-gradient(1100px 520px at 78% -8%, rgba(255,188,0,.20), transparent 62%), radial-gradient(760px 420px at 4% 8%, rgba(84,68,56,.55), transparent 58%)',
      },
      keyframes: {
        rise: { '0%': { opacity: '0', transform: 'translateY(14px)' },
                '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: { rise: 'rise .5s cubic-bezier(.22,.9,.3,1) both' },
    },
  },
  plugins: [],
};
export default config;
