import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // API_URL permite apuntar a otro backend en desarrollo (por defecto el de este repo en :8000)
        target: process.env.API_URL ?? 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        timeout: 70_000,
      },
    },
  },
})
