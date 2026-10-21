import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        '/messageucolab': {
          target: env.VITE_API_URL || 'http://localhost:8085',
          changeOrigin: true,
          timeout: 0,
          proxyTimeout: 0
        }
      }
    }
  }
})
