<script setup>
import { ref, reactive } from 'vue'
import { messageApi } from '../api'
import { store } from '../store'

const emit = defineEmits(['created'])

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
