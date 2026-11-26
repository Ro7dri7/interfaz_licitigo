import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'
import { darkTwins } from '../shared/a11y/dark-css.mjs'

const crmRoot = dirname(fileURLToPath(import.meta.url))

/** Añade al CSS del CRM las reglas gemelas de modo oscuro (solo pantalla; la impresión sigue clara). */
function crmDarkCss() {
  return {
    name: 'crm-dark-css',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const file = id.split('?')[0].replaceAll('\\', '/')
      if (!file.endsWith('/crm/src/styles.css') || id.includes('crm-shell')) return null
      return { code: code + darkTwins(code), map: null }
    },
  }
}

export default defineConfig({
  plugins: [crmDarkCss(), react(), tailwindcss(), ...(process.env.CRM_LOCAL_HTTPS === '1' ? [basicSsl({ name: 'LiciHub local' })] : [])],
  // shared/a11y está fuera del paquete: React debe resolverse siempre a la copia del CRM.
  resolve: {
    alias: {
      react: resolve(crmRoot, 'node_modules/react'),
      'react-dom': resolve(crmRoot, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [crmRoot, resolve(crmRoot, '../shared')] },
    proxy: { '/api': { target: process.env.CRM_API_URL ?? 'http://127.0.0.1:8001', changeOrigin: true } },
  },
})
