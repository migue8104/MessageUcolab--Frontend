<script setup>
import { reactive, ref } from 'vue'
import { catalogApi, messageApi } from '../api'
import { store } from '../store'
import AppModal from './ui/AppModal.vue'

const props = defineProps({ applicationId: { type: String, required: true }, applicationName: { type: String, required: true } })
const emit = defineEmits(['close', 'created'])
const form = reactive({ name: '', stateId: store.functionalityStates[0]?.value || '' })
const busy = ref(false)
const error = ref('')
const saved = ref(false)
const normalize = (name) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

async function save() {
  if (busy.value) return
  error.value = ''
  if (!form.name.trim() || !props.applicationId || !form.stateId) {
    error.value = 'Completa el nombre, la aplicación y el estado.'
    return
  }
  busy.value = true
  try {
    // El POST devuelve solo una confirmación. No reenviarlo si falla la lectura posterior.
    if (!saved.value) {
      await messageApi.createFunctionality({ name: form.name.trim(), applicationId: props.applicationId, stateId: form.stateId })
      saved.value = true
    }
    const list = await catalogApi.functionalities(props.applicationId)
    const matches = list.filter((item) => normalize(item.name) === normalize(form.name))
    if (matches.length !== 1) {
      error.value = 'La funcionalidad fue creada, pero aún no se puede identificar en el catálogo. Reintenta actualizar; no se creará otra vez.'
      return
    }
    emit('created', { functionality: matches[0], functionalities: list })
  } catch (e) {
    store.handleUnauthorized(e)
    error.value = saved.value ? `La funcionalidad se guardó. No se pudo actualizar el catálogo: ${e.message}` : e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppModal title="Nueva funcionalidad" description="Organiza los mensajes de tu aplicación." :busy="busy" @close="emit('close')">
    <form class="modal-form" @submit.prevent="save">
      <label>Nombre de la funcionalidad <span class="required">*</span>
        <input v-model="form.name" required maxlength="50" placeholder="Ej. Autenticación" :disabled="saved || busy" />
        <small>{{ form.name.length }}/50 caracteres</small>
      </label>
      <label>Aplicación asociada<input :value="applicationName" readonly /></label>
      <label>Estado <span class="required">*</span>
        <select v-model="form.stateId" required :disabled="saved || busy"><option v-for="state in store.functionalityStates" :key="state.value" :value="state.value">{{ state.name }}</option></select>
        <small>Solo las funcionalidades activas se podrán seleccionar al crear mensajes.</small>
      </label>
      <p v-if="error" class="alert error" role="alert">{{ error }}</p>
      <footer class="form-actions">
        <button type="button" class="secondary" :disabled="busy" @click="emit('close')">Cancelar</button>
        <button type="submit" :disabled="busy">{{ busy ? 'Guardando…' : saved ? 'Actualizar catálogo' : 'Crear funcionalidad' }}</button>
      </footer>
    </form>
  </AppModal>
</template>
