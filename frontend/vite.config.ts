import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  // `npm start` on a host such as Railway: listen on its PORT. Vite only
  // answers for allowed Host headers (otherwise 403 "Blocked request"), so
  // allow Railway's domains plus any custom domain in PREVIEW_ALLOWED_HOSTS.
  preview: {
    host: true,
    port: Number(process.env.PORT) || 4173,
    allowedHosts: [
      '.up.railway.app',
      ...(process.env.PREVIEW_ALLOWED_HOSTS ?? '')
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean),
    ],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  }
})
