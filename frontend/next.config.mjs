/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 백엔드는 별도 포트에서 돕니다. 개발 중 CORS를 피하려고 프록시로 넘깁니다.
  async rewrites() {
    return [{
      source: '/api/v1/:path*',
      destination: `${process.env.BACKEND_URL || 'http://127.0.0.1:8000'}/api/v1/:path*`,
    }];
  },
};
export default nextConfig;
