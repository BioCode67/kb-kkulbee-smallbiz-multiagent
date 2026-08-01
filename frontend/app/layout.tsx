import type { Metadata, Viewport } from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';

export const metadata: Metadata = {
  title: '꿀비 — 사장님 곁의 AI 비서',
  description:
    '어디에 열지, 자금은 어떻게, 억울한 일이 생기면 어떻게. 소상공인 사장님의 세 가지 고민을 한자리에서 답합니다.',
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
