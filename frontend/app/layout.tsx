import type { Metadata, Viewport } from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';

const DESC =
  '어디에 열지, 자금은 어떻게, 억울한 일이 생기면 어떻게. ' +
  '소상공인 사장님의 세 가지 고민을 한자리에서 답합니다.';

export const metadata: Metadata = {
  title: '꿀비 — 사장님 곁의 AI 비서',
  description: DESC,
  // 파비콘도 꿀비입니다. 심사위원이 탭을 여러 개 열어 두었을 때 이 아이
  // 얼굴로 우리 화면을 찾게 됩니다.
  icons: { icon: '/kkulbee.svg' },
  openGraph: {
    title: '꿀비 — 사장님 곁의 AI 비서',
    description: DESC,
    images: ['/kkulbee.svg'],
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#1C1814',
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
