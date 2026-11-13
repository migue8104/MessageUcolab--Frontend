<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { redirectToLogin, requireSession } from '../security/session'

const container = ref(null)
const errorMessage = ref('')
let handle = null
let disposed = false

async function mountParametrosAdministration() {
  const session = await requireSession()
  if (!session || disposed) return

  const parametrosUiUrl = import.meta.env.VITE_PARAMETROS_UI_URL?.trim()
  const applicationId = import.meta.env.VITE_PARAMETROS_APPLICATION_ID?.trim()
  const apiBaseUrl = import.meta.env.VITE_PARAMETROS_API_URL?.trim() || '/catalogo-parametros/api/v1'
  if (!parametrosUiUrl) throw new Error('Falta configurar VITE_PARAMETROS_UI_URL.')
  if (!applicationId) throw new Error('Falta configurar VITE_PARAMETROS_APPLICATION_ID (UUID de la aplicación en el Catálogo de Parámetros).')

  // Some remote bundles still read process.env in the browser.
  if (typeof globalThis.process === 'undefined') {
    globalThis.process = { env: { NODE_ENV: import.meta.env.MODE } }
  }

  const remote = await import(/* @vite-ignore */ parametrosUiUrl)
  if (typeof remote.mount !== 'function') {
    throw new Error('El microfrontend de Parámetros no expone la API pública mount.')
  }
  if (disposed) return

  handle = remote.mount(container.value, {
    applicationId,
    apiBaseUrl,
    refreshIntervalMs: 60000,
    onAuthenticationRequired: () => { redirectToLogin() }
  })
  await handle?.ready
}

onMounted(() => {
  mountParametrosAdministration().catch((error) => {
    console.error('No fue posible cargar el microfrontend de Parámetros.', error)
    errorMessage.value = error instanceof Error ? error.message : 'No fue posible cargar Parámetros.'
  })
})

onBeforeUnmount(() => {
  disposed = true
  handle?.unmount?.()
  handle = null
})
</script>

<template>
  <p v-if="errorMessage" class="alert error" role="alert">{{ errorMessage }}</p>
  <div id="parametros" ref="container"></div>
</template>
