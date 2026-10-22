<script setup>
import { reactive, ref } from 'vue'
import { store } from '../store'

const emit = defineEmits(['selected'])
const organizationName = ref('')
const busy = ref(false)
const error = ref('')
const applicationForm = reactive({
  name: '',
  languageId: store.languages[0]?.value || '',
  stateId: store.applicationStates[0]?.value || ''
})

async function perform(action) {
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    store.handleUnauthorized(e)
    error.value = e.message
  } finally {
    busy.value = false
  }
}

function openOrganization(organization) {
  return perform(() => store.selectOrganization(organization))
}

function createOrganization() {
  if (!organizationName.value.trim()) return
  return perform(async () => {
    await store.createPersonalOrganization(organizationName.value.trim())
    organizationName.value = ''
  })
}

function createApplication() {
  if (!applicationForm.name.trim()) return
  return perform(async () => {
    await store.createPersonalApplication({ ...applicationForm, name: applicationForm.name.trim() })
    applicationForm.name = ''
  })
}

function select(app) {
  return perform(async () => {
    await store.selectSessionApplication({ ...app, organization: store.activeOrganization })
    emit('selected')
  })
}

function back() {
  store.activeOrganization = null
  store.organizationApplications = []
  error.value = ''
}
</script>

<template>
  <section class="card" :aria-busy="busy || store.contextsLoading">
    <h2>{{ store.activeOrganization ? store.activeOrganization.name : 'Mis organizaciones' }}</h2>
    <p class="info">Tu espacio personal: solo puedes gestionar tus organizaciones y sus aplicaciones.</p>
    <p v-if="store.contextsLoading" class="info" role="status">Cargando espacio de trabajo…</p>
    <p v-if="store.contextsError" class="err" role="alert">
      {{ store.contextsError }}
      <button class="link" :disabled="busy || store.contextsLoading" @click="store.loadSessionApplications()">Reintentar</button>
    </p>
    <p v-if="error" class="err" role="alert">{{ error }}</p>

    <fieldset :disabled="busy || store.contextsLoading">
      <template v-if="!store.activeOrganization">
        <div class="ctx-grid">
          <div v-for="organization in store.organizations" :key="organization.id" class="ctx-card">
            <strong>{{ organization.name }}</strong>
            <button @click="openOrganization(organization)">Ver aplicaciones</button>
          </div>
        </div>
        <p v-if="!store.contextsLoading && !store.organizations.length && !store.contextsError" class="info">
          Todavía no tienes organizaciones. Crea la primera para empezar.
        </p>
        <form class="workspace-form" @submit.prevent="createOrganization">
          <h3>Crear organización</h3>
          <label>Nombre <input v-model="organizationName" required maxlength="50" autocomplete="organization" /></label>
          <button type="submit">{{ busy ? 'Guardando…' : 'Crear organización' }}</button>
        </form>
      </template>

      <template v-else>
        <button class="secondary" @click="back">Volver a mis organizaciones</button>
        <h3>Mis aplicaciones</h3>
        <div class="ctx-grid">
          <div v-for="app in store.organizationApplications" :key="app.id" class="ctx-card">
            <strong>{{ app.name }}</strong>
            <button @click="select(app)">Administrar mensajes</button>
          </div>
        </div>
        <p v-if="!store.organizationApplications.length" class="info">Esta organización todavía no tiene aplicaciones.</p>
        <form class="workspace-form" @submit.prevent="createApplication">
          <h3>Crear aplicación</h3>
          <label>Nombre <input v-model="applicationForm.name" required maxlength="50" /></label>
          <label>
            Idioma base
            <select v-model="applicationForm.languageId" required>
              <option v-for="language in store.languages" :key="language.value" :value="language.value">{{ language.name }}</option>
            </select>
          </label>
          <p class="info">Se crearán los ambientes Develop, Testing y Production.</p>
          <button type="submit">{{ busy ? 'Guardando…' : 'Crear aplicación' }}</button>
        </form>
      </template>
    </fieldset>
  </section>
</template>

<style scoped>
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.ctx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr)); gap: 12px; margin: 16px 0; }
.ctx-card { display: flex; flex-direction: column; gap: 14px; border: 1px solid #dfe6ef; border-radius: 5px; padding: 16px; }
.ctx-card strong { color: #102b52; overflow-wrap: anywhere; }
.ctx-card button { margin-top: auto; }
.workspace-form { display: grid; gap: 12px; max-width: 440px; margin-top: 24px; }
.workspace-form h3 { margin-bottom: 0; }
</style>
