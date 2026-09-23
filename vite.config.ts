import { Agent } from 'node:https'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_HOST = 'https://api.awsevents.com'

const PORT = 8484

const keepAliveAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 12,
})

const proxy = {
  '/api': {
    target: API_HOST,
    changeOrigin: true,
    secure: true,
    agent: keepAliveAgent,
    rewrite: (path: string) => path.replace(/^\/api/, '') || '/',
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: PORT, strictPort: false, proxy },
  preview: { port: PORT, strictPort: false, proxy },
})
