import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.BASE || '/',
  server: { host: true, port: 45371, strictPort: true },
})
