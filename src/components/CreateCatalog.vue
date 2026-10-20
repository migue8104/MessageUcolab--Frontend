<script setup>
import { ref, reactive, computed } from 'vue'
import { messageApi } from '../api'
import { store } from '../store'

const emit = defineEmits(['created'])

const context = computed(() => store.activeContext || {})

// --- Formulario: Aplicación ---
const appForm = reactive({
  name: '',
  languageId: store.languages[0]?.value || '',
  stateId: store.applicationStates[0]?.value || ''
})
const appError = ref('')
const appSuccess = ref('')
const applicationForbidden = ref(false)

async function createApplication() {
  appError.value = ''
  appSuccess.value = ''
  if (!appForm.name.trim()) return (appError.value = 'El nombre no puede estar vacío.')
  const organizationId = context.value.organization?.id || context.value.organizationId || ''
  if (!organizationId)
    return (appError.value = 'No hay organización activa. Selecciona un contexto primero.')
  try {
    await messageApi.createApplication(
      {
        name: appForm.name.trim(),
        organizationId,
        languageId: appForm.languageId,
        stateId: appForm.stateId
      }
    )
    appSuccess.value = 'Aplicación creada.'
    appForm.name = ''
    emit('created', 'application')
  } catch (e) {
    store.handleUnauthorized(e)
    applicationForbidden.value = e.code === 'FORBIDDEN'
    appError.value = e.message
  }
}

// --- Formulario: Funcionalidad ---
const funcForm = reactive({
  name: '',
  applicationId: '',
  stateId: store.functionalityStates[0]?.value || ''
})
const funcError = ref('')
const funcSuccess = ref('')
const functionalityForbidden = ref(false)

async function createFunctionality() {
  funcError.value = ''
  funcSuccess.value = ''
  if (!funcForm.name.trim()) return (funcError.value = 'El nombre no puede estar vacío.')
  if (!funcForm.applicationId)
    return (funcError.value = 'Selecciona una aplicación.')
  try {
    await messageApi.createFunctionality(
      {
        name: funcForm.name.trim(),
        applicationId: funcForm.applicationId,
        stateId: funcForm.stateId
      }
    )
    funcSuccess.value = 'Funcionalidad creada.'
    funcForm.name = ''
    emit('created', 'functionality')
  } catch (e) {
    store.handleUnauthorized(e)
    functionalityForbidden.value = e.code === 'FORBIDDEN'
    funcError.value = e.message
  }
}
</script>

<template>
  <section class="card">
    <h2>Catálogos</h2>

    <p v-if="!store.isAuthenticated" class="warn">
      Debes iniciar sesión para administrar catálogos.
    </p>

    <template v-else>
      <!-- Aplicación -->
      <h3 class="sub">Crear aplicación</h3>
      <div class="grid">
        <label>
          Nombre
          <input v-model="appForm.name" placeholder="App Documental Flow" />
        </label>
        <label>
          Organización
          <input
            :value="context.organization?.name || context.organizationName || (context.organizationId || 'Selecciona un contexto')"
            disabled
          />
        </label>
        <label>
          Idioma (language_base)
          <select v-model="appForm.languageId">
            <option v-for="l in store.languages" :key="l.value" :value="l.value">{{ l.name }}</option>
          </select>
        </label>
        <label>
          Estado (application_state)
          <select v-model="appForm.stateId">
            <option v-for="s in store.applicationStates" :key="s.value" :value="s.value">{{ s.name }}</option>
          </select>
        </label>
      </div>
      <p v-if="appError" class="err">{{ appError }}</p>
      <p v-if="appSuccess" class="ok">{{ appSuccess }}</p>
      <button :disabled="applicationForbidden" @click="createApplication">Crear aplicación</button>

      <hr />

      <!-- Funcionalidad -->
      <h3 class="sub">Crear funcionalidad</h3>
      <div class="grid">
        <label>
          Nombre
          <input v-model="funcForm.name" placeholder="Flujo documental" />
        </label>
        <label>
          Aplicación
          <select v-model="funcForm.applicationId">
            <option value="">Seleccionar…</option>
            <option v-for="a in store.applications" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label>
          Estado (functionality_state)
          <select v-model="funcForm.stateId">
            <option v-for="s in store.functionalityStates" :key="s.value" :value="s.value">{{ s.name }}</option>
          </select>
        </label>
      </div>
      <p v-if="funcError" class="err">{{ funcError }}</p>
      <p v-if="funcSuccess" class="ok">{{ funcSuccess }}</p>
      <button :disabled="functionalityForbidden" @click="createFunctionality">Crear funcionalidad</button>
    </template>
  </section>
</template>
