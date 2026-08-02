import type { Config } from 'tailwindcss';

/** KB 브랜드 색을 토큰으로 고정한다. 화면마다 hex를 적으면 곧 달라진다. */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kb: {
          // KB 로고의 두 색 그대로 — 옐로 #FFBC00 위에 잉크 마크.
          // 라이트 테마: 크림 바탕, 잉크는 로고의 짙은 웜 그레이,
          // 옐로는 면으로 진하게 쓴다. 흰 바탕 글자용으로는 앰버.
          yellow: '#FFBC00',
          yellowSoft: '#FFD35C',
          amber: '#9A6B00',
          cream: '#FBF7EE',
          brown: '#8A7B6C',
          brownDeep: '#60584D',
          ink: '#38322A',
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
