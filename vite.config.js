import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/messageucolab': {
        target: 'http://localhost:8085',
        changeOrigin: true
      }
    }
  }
})
