import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/messageucolab': {
        target: 'http://52.251.53.20:8000',
        changeOrigin: true
      }
    }
  }
})
