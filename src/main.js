import { createApp } from 'vue'
import App from './App.vue'
import { requireSession, sessionRecovery } from './security/session'
import { store } from './store'
import './style.css'

async function bootstrap() {
  const session = await requireSession()

  if (session) {
    store.setSession()
  }
  if (session || sessionRecovery.status === 'blocked') {
    createApp(App).mount('#app')
  }
}

bootstrap().catch((error) => {
  console.error('No fue posible iniciar la aplicación.', error)
  const appRoot = document.querySelector('#app')
  if (appRoot) {
    appRoot.textContent = error instanceof Error
      ? error.message
      : 'No fue posible iniciar la aplicación.'
  }
})
