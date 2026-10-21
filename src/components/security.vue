<script setup>
import { onMounted } from 'vue'
import { requireSession } from '../security/session'

async function mountSecurityAdministration() {
  const session = await requireSession()
  if (!session) return

  const securityUiUrl = import.meta.env.VITE_SECURITY_UI_URL
  const securityUiContainer = document.querySelector('#security-ui')
  if (!securityUiContainer) {
    throw new Error('No se encontró el contenedor de Security UI.')
  }

  // Some remote bundles still read process.env in the browser.
  if (typeof globalThis.process === 'undefined') {
    globalThis.process = { env: { NODE_ENV: import.meta.env.MODE } }
  }

  const remote = await import(/* @vite-ignore */ securityUiUrl)
  if (typeof remote.mount !== 'function') {
    throw new Error('Security UI no expone la API pública mount.')
  }

  // El id evita depender de que el nombre sea único entre tenants.
  const applicationId = import.meta.env.VITE_APPLICATION_ID?.trim()
  remote.mount(securityUiContainer, {
    ...(applicationId
      ? { applicationId }
      : { applicationName: import.meta.env.VITE_APPLICATION_NAME }),
    apiBaseUrl: import.meta.env.VITE_PDP_URL,
    allowApplicationLifecycleManagement: false,
    theme: {
      accent: '#116149',
      fontFamily: 'system-ui, sans-serif',
      radius: '12px'
    }
  })
}

onMounted(() => {
  mountSecurityAdministration().catch((error) => {
    console.error('No fue posible cargar Security UI.', error)
  })
})
</script>

<template>
  <div id="security-ui"></div>
</template>
