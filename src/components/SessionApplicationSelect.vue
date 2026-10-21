<script setup>
import { reactive, ref, computed } from 'vue'
import { store } from '../store'

const emit = defineEmits(['selected'])

const registering = ref('')
const registerError = ref('')
const registerForm = reactive({
  organizationId: import.meta.env.VITE_DEFAULT_ORGANIZATION_ID || '',
  languageId: store.languages[0]?.value || '',
  stateId: store.applicationStates[0]?.value || ''
})

const errorText = computed(() => {
  const err = store.contextsError
  if (!err) return ''
  return typeof err === 'string' ? err : JSON.stringify(err)
})

async function select(app) {
  try {
    await store.selectSessionApplication(app)
    emit('selected')
  } catch (_) {
    // el error queda expuesto en store.contextsError
  }
}

async function register(app) {
  if (!registerForm.organizationId) {
    registerError.value = 'Configura VITE_DEFAULT_ORGANIZATION_ID para registrar aplicaciones.'
    return
  }
  registering.value = app.id
  registerError.value = ''
  try {
    await store.registerSessionApplication(app, registerForm)
  } catch (e) {
    registerError.value = e.message
  } finally {
    registering.value = ''
  }
}
</script>

<template>
  <section class="card">
    <h2>Selecciona tu aplicación</h2>
    <p class="info">
      Son las aplicaciones que el componente de seguridad tiene asignadas a tu usuario.
    </p>

    <p v-if="store.contextsLoading" class="info">Cargando aplicaciones…</p>
    <p v-if="errorText" class="err">
      {{ errorText }}
      <button class="link" @click="store.loadSessionApplications()">Reintentar</button>
    </p>
    <p v-if="registerError" class="err" role="alert">{{ registerError }}</p>

    <div class="ctx-grid">
      <div v-for="app in store.sessionApplications" :key="app.id" class="ctx-card">
        <strong class="ctx-app">{{ app.name }}</strong>
        <span class="ctx-org">{{ app.organization?.name || (app.registered ? '' : 'Sin registrar en el catálogo') }}</span>
        <button v-if="app.registered" @click="select(app)">Seleccionar</button>
        <button
          v-else
          class="secondary"
          :disabled="registering === app.id"
          @click="register(app)"
        >
          {{ registering === app.id ? 'Registrando…' : 'Registrar en el catálogo' }}
        </button>
      </div>
    </div>

    <p v-if="!store.contextsLoading && !store.sessionApplications.length && !errorText" class="info">
      No tienes aplicaciones asignadas. Solicita acceso a un administrador de seguridad.
    </p>
  </section>
</template>

<style scoped>
.ctx-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr));
  gap: 10px;
  margin-top: 12px;
}

.ctx-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid #dfe6ef;
  border-radius: 5px;
  padding: 15px;
  background: #fff;
  transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}

.ctx-card:hover {
  transform: translateY(-2px);
  border-color: #72a9e9;
  box-shadow: 0 8px 18px rgb(9 35 77 / 8%);
}

.ctx-card button {
  margin-top: 10px;
  width: 100%;
}

.ctx-app {
  color: #102b52;
  font-size: 13px;
}

.ctx-org {
  color: #315d94;
  font-weight: 600;
}
</style>
