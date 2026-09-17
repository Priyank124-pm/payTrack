/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // The NexPortal admin app (CRA) runs on its own dev server on 3002,
      // configured with PUBLIC_URL=/admin so its own asset paths already
      // match this prefix — see client/.env.development.
      { source: '/admin', destination: 'http://localhost:3002/admin' },
      { source: '/admin/:path*', destination: 'http://localhost:3002/admin/:path*' },
      // Both this site and the admin app call the same Express API by
      // relative path — proxying it here keeps everything on one origin.
      { source: '/api/:path*', destination: 'http://localhost:4000/api/:path*' },
    ];
  },
};

export default nextConfig;
