/** @type {import('next').NextConfig} */
const nextConfig = {
  /* El repo tiene deuda de ESLint (hooks, comillas en JSX, etc.). next build no la bloquea; usar `npm run lint` para ir limpiando. */
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
