import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 6767, host: true, strictPort: true,
    proxy: {
      // server-side fetch to Yahoo Finance — avoids browser CORS, no API key
      '/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        rewrite: (p) => p.replace(/^\/yahoo/, ''),
      },
    },
  },
})
