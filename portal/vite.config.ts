import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'
import { prepareBrandCss, scopeStylesheet } from '../scripts/crm-shell-css.mjs'
import { darkTwins } from '../shared/a11y/dark-css.mjs'

const portalRoot = dirname(fileURLToPath(import.meta.url))

function crmShellCss() {
  return {
    name: 'crm-shell-css',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.includes('crm-shell')) return null
      const file = id.split('?')[0].replaceAll('\\', '/')
      if (file.endsWith('/crm/src/brand.css')) return { code: scopeStylesheet(prepareBrandCss(code)), map: null }
      if (file.endsWith('/crm/src/styles.css')) {
        // Reglas gemelas de modo oscuro (solo pantalla) para los colores fijos del CRM.
        const scoped = scopeStylesheet(code)
        return { code: scoped + darkTwins(scoped), map: null }
      }
      return null
    },
  }
}

export default defineConfig(({ command }) => {
  // El certificado local y el proxy de 127.0.0.1 solo aplican al servidor de desarrollo.
  // El build de Vercel incluye /comercial sin LICIHUB_UNIFIED.
  if (command === 'build' && !process.env.VITE_CRM_BASE) process.env.VITE_CRM_BASE = '/comercial'
  const unified = process.env.LICIHUB_UNIFIED === '1'
  const portalApi = process.env.API_URL ?? 'http://127.0.0.1:8000'
  const crmApi = process.env.CRM_API_URL ?? 'http://127.0.0.1:8001'
  return {
    plugins: [
      crmShellCss(),
      react(),
      tailwindcss(),
      ...(unified ? [basicSsl({ name: 'LiciHub local' })] : []),
    ],
    resolve: {
      alias: {
        react: resolve(portalRoot, 'node_modules/react'),
        'react-dom': resolve(portalRoot, 'node_modules/react-dom'),
        'react-router-dom': resolve(portalRoot, 'node_modules/react-router-dom'),
      },
      dedupe: ['react', 'react-dom', 'react-router-dom'],
    },
    // /api/crm va antes que /api: el proxy usa el primer prefijo que coincida.
    server: (unified ? {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      fs: { allow: [portalRoot, resolve(portalRoot, '..')] },
      proxy: {
        '/api/crm': { target: crmApi, changeOrigin: true, secure: false },
        '/api': {
          target: portalApi,
          changeOrigin: true,
          secure: false,
          timeout: 70_000,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              proxyReq.setHeader('X-Forwarded-Proto', 'https')
              if (req.headers.host) proxyReq.setHeader('X-Forwarded-Host', req.headers.host)
            })
          },
        },
      },
    } : {
      port: 5173,
      fs: { allow: [portalRoot, resolve(portalRoot, '../shared')] },
      proxy: {
        '/api': {
          target: process.env.API_URL ?? 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
          timeout: 70_000,
        },
      },
    }) as UserConfig['server'],
  }
})
