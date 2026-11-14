<script setup>
import { onMounted, reactive, ref } from 'vue'
import { store } from '../store'
import { serviceIdentityApi } from '../api'
import AppModal from './ui/AppModal.vue'
import AppIcon from './ui/AppIcon.vue'
import EnvironmentBadge from './ui/EnvironmentBadge.vue'

const props = defineProps({
  application: { type: Object, required: true },
  environments: { type: Array, default: () => [] }
})
const emit = defineEmits(['close'])

const identities = ref([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const form = reactive({ environmentId: props.environments[0]?.id || '', clientId: '' })

async function run(action) {
  error.value = ''
  notice.value = ''
  try {
    await action()
  } catch (e) {
    store.handleUnauthorized(e)
    error.value = e.message
  }
}

function load() {
  return run(async () => {
    identities.value = await serviceIdentityApi.list(props.application.id)
  }).finally(() => (loading.value = false))
}

async function register() {
  const clientId = form.clientId.trim()
  if (!clientId) return (error.value = 'Ingresa el Client ID de la identidad de servicio.')
  if (busy.value) return
  busy.value = true
  await run(async () => {
    await serviceIdentityApi.register(props.application.id, form.environmentId, clientId)
    form.clientId = ''
    identities.value = await serviceIdentityApi.list(props.application.id)
    notice.value = `La identidad ${clientId} ya puede consumir los mensajes del ambiente.`
  })
  busy.value = false
}

async function remove(identity) {
  if (busy.value) return
  busy.value = true
  await run(async () => {
    await serviceIdentityApi.remove(props.application.id, identity.clientId)
    identities.value = identities.value.filter((item) => item.clientId !== identity.clientId)
    notice.value = `La identidad ${identity.clientId} ya no puede consumir mensajes de esta aplicación.`
  })
  busy.value = false
}

onMounted(load)
</script>

<template>
  <AppModal title="Identidades de servicio" :description="`Aplicaciones que consumen los mensajes de ${application.name}.`" :busy="busy" wide @close="!busy && emit('close')">
    <div class="modal-form service-identities">
      <p class="context-notice"><AppIcon name="shield" :size="17" />Pega el Client ID de la identidad que la aplicación consumidora creó en el componente de seguridad y elige el ambiente que va a consumir. Cada identidad consume un solo ambiente; MessageUcoLab lo reconoce desde el token, sin copiar identificadores.</p>

      <form class="service-identity-form" @submit.prevent="register">
        <fieldset :disabled="busy || loading">
          <label>Ambiente <span class="required">*</span>
            <select v-model="form.environmentId" required>
              <option v-for="env in environments" :key="env.id" :value="env.id">{{ env.name }}</option>
            </select>
          </label>
          <label>Client ID <span class="required">*</span>
            <input v-model="form.clientId" required maxlength="255" autocomplete="off" spellcheck="false" placeholder="Client ID de la identidad de servicio" />
          </label>
          <button type="submit"><AppIcon name="plus" :size="16" />{{ busy ? 'Guardando…' : 'Registrar' }}</button>
        </fieldset>
      </form>

      <p v-if="error" class="alert error" role="alert">{{ error }}</p>
      <p v-if="notice" class="alert success" role="status">{{ notice }}</p>

      <p v-if="loading" class="info" role="status">Cargando identidades…</p>
      <p v-else-if="!identities.length" class="info">Ninguna aplicación consume todavía los mensajes de esta aplicación.</p>
      <ul v-else class="service-identity-list">
        <li v-for="identity in identities" :key="identity.clientId">
          <code>{{ identity.clientId }}</code>
          <EnvironmentBadge :name="environments.find((env) => env.id === identity.environmentId)?.name || identity.environmentName" />
          <button type="button" class="link danger" :disabled="busy" :aria-label="`Quitar la identidad ${identity.clientId}`" @click="remove(identity)"><AppIcon name="trash" :size="15" />Quitar</button>
        </li>
      </ul>

      <footer class="form-actions"><button type="button" class="secondary" :disabled="busy" @click="emit('close')">Cerrar</button></footer>
    </div>
  </AppModal>
</template>

<style scoped>
.service-identities .form-actions { padding-top: 12px; padding-bottom: 16px; }
.service-identity-form fieldset { display: grid; grid-template-columns: minmax(130px, 180px) minmax(0, 1fr) auto; align-items: end; gap: 12px; margin: 0; padding: 0; border: 0; }
.service-identity-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.service-identity-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 7px; }
.service-identity-list code { overflow-wrap: anywhere; font-size: 12px; }
@media (max-width: 640px) {
  .service-identity-form fieldset { grid-template-columns: 1fr; }
}
</style>
