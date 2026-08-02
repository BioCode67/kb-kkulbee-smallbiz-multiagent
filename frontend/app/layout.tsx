import type { Metadata, Viewport } from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';

const DESC =
  '어디에 열지, 자금은 어떻게, 억울한 일이 생기면 어떻게. ' +
  '소상공인 사장님의 세 가지 고민을 한자리에서 답합니다.';

export const metadata: Metadata = {
  // 카톡·SNS 크롤러가 절대 주소를 요구합니다. 상대 경로만 두면
  // 미리보기 카드에 그림이 안 뜹니다.
  metadataBase: new URL('https://kb-kkulbee-smallbiz-multiagent.onrender.com'),
  title: '꿀비 — 사장님 곁의 AI 비서',
  description: DESC,
  // 파비콘도 꿀비입니다. 심사위원이 탭을 여러 개 열어 두었을 때 이 아이
  // 얼굴로 우리 화면을 찾게 됩니다.
  icons: { icon: '/kkulbee.svg', apple: '/icon-192.png' },
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: '꿀비 — 사장님 곁의 AI 비서',
    description: DESC,
    // 카톡은 SVG를 못 읽습니다 — 1200×630 PNG를 따로 구웠습니다.
    images: [{ url: '/og.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};

export const viewport: Viewport = {
  themeColor: '#FBF7EE',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
