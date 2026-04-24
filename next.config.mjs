/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'], // 将配置放入 experimental 属性中
  // serverExternalPackages: ['better-sqlite3'],
  webpack: (config) => {
    config.externals.push({
      'better-sqlite3': 'commonjs better-sqlite3',
      '@aws-sdk/client-s3': 'commonjs @aws-sdk/client-s3',
    });
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
