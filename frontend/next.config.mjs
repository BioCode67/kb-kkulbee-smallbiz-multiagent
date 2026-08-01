/** @type {import('next').NextConfig} */
//
// 개발과 배포에서 다르게 돕니다.
//
// 개발 — Next 개발 서버(3000)와 FastAPI(8000)가 따로 뜹니다. /api/v1 요청을
//        프록시로 넘겨 CORS를 피합니다.
// 배포 — 정적 파일로 내보내 FastAPI가 직접 서빙합니다. 주소가 하나여야
//        심사에서 헷갈리지 않고, Node 프로세스를 안 띄우므로 Render 무료
//        등급 512MB 안에 여유가 생깁니다. 같은 출처라 프록시도 필요 없습니다.
const isExport = process.env.STATIC_EXPORT === '1';

const nextConfig = {
  reactStrictMode: true,
  ...(isExport
    ? { output: 'export', images: { unoptimized: true } }
    : {
        async rewrites() {
          return [{
            source: '/api/v1/:path*',
            destination: `${process.env.BACKEND_URL || 'http://127.0.0.1:8000'}/api/v1/:path*`,
          }];
        },
      }),
};
export default nextConfig;
