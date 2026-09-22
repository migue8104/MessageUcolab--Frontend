<script setup>
import { ref, reactive } from 'vue'
import { messageApi } from '../api'
import { store } from '../store'

const emit = defineEmits(['created'])

const today = new Date()
const toLocal = (date) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const yearFromNow = new Date(Date.now() + 365 * 24 * 3600 * 1000)

// --- Formulario: Aplicación ---
const appForm = reactive({
  name: '',
  languageId: 'es',
  startDate: toLocal(today),
  endDate: toLocal(yearFromNow),
  stateId: 'active'
})
const appError = ref('')
const appSuccess = ref('')

async function createApplication() {
  appError.value = ''
  appSuccess.value = ''
  if (!appForm.name.trim()) return (appError.value = 'El nombre no puede estar vacío.')
  try {
    await messageApi.createApplication(
      {
        name: appForm.name.trim(),
        languageId: appForm.languageId,
        startDate: appForm.startDate + ':00',
        endDate: appForm.endDate + ':00',
        stateId: appForm.stateId
      },
      store.token
    )
    appSuccess.value = 'Aplicación creada.'
    appForm.name = ''
    emit('created')
  } catch (e) {
    appError.value = e.message
  }
}

// --- Formulario: Entorno ---
const envForm = reactive({
  name: '',
  applicationId: '',
  typeId: 'develop',
  stateId: 'active'
})
const envError = ref('')
const envSuccess = ref('')

async function createEnvironment() {
  envError.value = ''
  envSuccess.value = ''
  if (!envForm.name.trim()) return (envError.value = 'El nombre no puede estar vacío.')
  if (!envForm.applicationId)
    return (envError.value = 'Selecciona una aplicación.')
  try {
    await messageApi.createEnvironment(
      {
        name: envForm.name.trim(),
        applicationId: envForm.applicationId,
        typeId: envForm.typeId,
        stateId: envForm.stateId
      },
      store.token
    )
    envSuccess.value = 'Entorno creado.'
    envForm.name = ''
    emit('created')
  } catch (e) {
    envError.value = e.message
  }
}

// --- Formulario: Funcionalidad ---
const funcForm = reactive({
  name: '',
  applicationId: '',
  startDate: toLocal(today),
  endDate: toLocal(yearFromNow),
  stateId: 'active'
})
const funcError = ref('')
const funcSuccess = ref('')

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
        startDate: funcForm.startDate + ':00',
        endDate: funcForm.endDate + ':00',
        stateId: funcForm.stateId
      },
      store.token
    )
    funcSuccess.value = 'Funcionalidad creada.'
    funcForm.name = ''
    emit('created')
  } catch (e) {
    funcError.value = e.message
  }
}
</script>

<template>
  <section class="card">
    <h2>Catálogos</h2>

    <p v-if="!store.token" class="warn">
      No hay token. Ve a la pestaña "Crear token" y genera uno primero.
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
        <label>
          Fecha inicio
          <input type="datetime-local" v-model="appForm.startDate" />
        </label>
        <label>
          Fecha fin
          <input type="datetime-local" v-model="appForm.endDate" />
        </label>
      </div>
      <p v-if="appError" class="err">{{ appError }}</p>
      <p v-if="appSuccess" class="ok">{{ appSuccess }}</p>
      <button @click="createApplication">Crear aplicación</button>

      <hr />

      <!-- Entorno -->
      <h3 class="sub">Crear entorno</h3>
      <div class="grid">
        <label>
          Nombre
          <input v-model="envForm.name" placeholder="DEV" />
        </label>
        <label>
          Aplicación
          <select v-model="envForm.applicationId">
            <option value="">Seleccionar…</option>
            <option v-for="a in store.applications" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label>
          Tipo (environment_type)
          <select v-model="envForm.typeId">
            <option v-for="t in store.environmentTypes" :key="t.value" :value="t.value">{{ t.name }}</option>
          </select>
        </label>
        <label>
          Estado (environment_state)
          <select v-model="envForm.stateId">
            <option v-for="s in store.environmentStates" :key="s.value" :value="s.value">{{ s.name }}</option>
          </select>
        </label>
      </div>
      <p v-if="envError" class="err">{{ envError }}</p>
      <p v-if="envSuccess" class="ok">{{ envSuccess }}</p>
      <button @click="createEnvironment">Crear entorno</button>

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
        <label>
          Fecha inicio
          <input type="datetime-local" v-model="funcForm.startDate" />
        </label>
        <label>
          Fecha fin
          <input type="datetime-local" v-model="funcForm.endDate" />
        </label>
      </div>
      <p v-if="funcError" class="err">{{ funcError }}</p>
      <p v-if="funcSuccess" class="ok">{{ funcSuccess }}</p>
      <button @click="createFunctionality">Crear funcionalidad</button>
    </template>
  </section>
</template>