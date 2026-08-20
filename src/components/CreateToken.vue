<script setup>
import { ref, reactive, onMounted } from 'vue'
import { catalogApi, messageApi } from '../api'
import { store } from '../store'

const applications = ref([])
const environments = ref([])
const expiration = ref('')
const error = ref('')

const form = reactive({
  applicationId: '',
  environmentId: ''
})

async function loadCatalogs() {
  try {
    applications.value = await catalogApi.applications()
    // Fecha de expiración por defecto: dentro de 30 días
    expiration.value = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 16)
  } catch (e) {
    error.value = 'Error cargando catálogos: ' + e.message
  }
}

async function onAppChange() {
  form.environmentId = ''
  environments.value = []
  error.value = ''
  if (!form.applicationId) return
  try {
    environments.value = await catalogApi.environments(form.applicationId)
  } catch (e) {
    error.value = 'Error cargando entorno: ' + e.message
  }
}

async function generateToken() {
  error.value = ''
  try {
    const data = await messageApi.generateToken(form.applicationId, {
      expirationDate: expiration.value + ':00',
      environmentId: form.environmentId
    })
    store.setToken(data[0])
  } catch (e) {
    error.value = e.message
  }
}

onMounted(loadCatalogs)
</script>

<template>
  <section class="card">
    <h2>Generar token</h2>

    <div class="grid">
      <label>
        Aplicación
        <select v-model="form.applicationId" @change="onAppChange">
          <option value="">Seleccionar…</option>
          <option v-for="a in applications" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <label>
        Entorno
        <select v-model="form.environmentId" :disabled="!environments.length">
          <option value="">Seleccionar…</option>
          <option v-for="e in environments" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
      </label>
      <label>
        Fecha de expiración
        <input type="datetime-local" v-model="expiration" />
      </label>
    </div>

    <p v-if="error" class="err">{{ error }}</p>

    <button :disabled="!form.applicationId || !form.environmentId" @click="generateToken">
      Generar token
    </button>

    <p v-if="store.token" class="ok">
      Token generado: <code>{{ store.token }}</code>
    </p>
  </section>
</template>