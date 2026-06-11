import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { port: 5180 },
  build: { chunkSizeWarningLimit: 1200 },
})
