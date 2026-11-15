import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev talks to the deployed backend: /api and /config.json are proxied to CloudFront.
const target = process.env.MOVIE_NIGHT_URL ?? 'https://d2nvw32wp3gy8d.cloudfront.net'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/config.json': { target, changeOrigin: true },
    },
  },
  build: { target: 'es2020', sourcemap: false },
})
