import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // Backend contract-first (contextos, catálogos, mensajes), puerto 8085
      '/messageucolab': {
        target: 'http://localhost:8085',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0
      }
    }
  }
})
