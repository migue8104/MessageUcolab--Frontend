<script setup>
import { computed, ref } from 'vue'
import { messageApi } from '../api'
import { store } from '../store'
import { statusName } from '../presentation'
import AppModal from './ui/AppModal.vue'

const props = defineProps({
  functionality: { type: Object, required: true },
  applicationId: { type: String, required: true }
})
const emit = defineEmits(['close', 'updated'])
const busy = ref(false)
const error = ref('')
const deactivating = computed(() => statusName(props.functionality) === 'Activo')
const action = computed(() => deactivating.value ? 'Inactivar' : 'Activar')
const targetState = computed(() => store.functionalityStates.find((state) =>
  state.name === (deactivating.value ? 'Inactivo' : 'Activo')))

async function save() {
  if (busy.value || !targetState.value) return
  busy.value = true
  error.value = ''
  try {
    const state = targetState.value
    await messageApi.updateFunctionalityState(props.functionality.id, props.applicationId, state.value)
    emit('updated', { id: props.functionality.id, stateId: state.value, state: state.name })
  } catch (e) {
    store.handleUnauthorized(e)
    error.value = e.status === 403
      ? 'No tienes permiso para cambiar el estado. Solicita revisar el permiso de esta ruta en seguridad.'
      : e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppModal :title="`${action} funcionalidad`" :busy="busy" @close="emit('close')">
    <form class="modal-form" @submit.prevent="save">
      <p>¿Deseas {{ action.toLocaleLowerCase() }} la funcionalidad <strong>{{ functionality.name }}</strong>?</p>
      <p v-if="deactivating" class="alert warning">Todos los mensajes asociados pasarán a inactivos en todos sus ambientes y dejarán de estar disponibles para consumo. No se eliminarán.</p>
      <p v-else class="data-note">Los mensajes conservarán su estado actual. Activar la funcionalidad no reactiva automáticamente sus mensajes.</p>
      <p v-if="error" class="alert error" role="alert">{{ error }}</p>
      <footer class="form-actions">
        <button type="button" class="secondary" :disabled="busy" @click="emit('close')">Cancelar</button>
        <button type="submit" :disabled="busy || !targetState">{{ busy ? 'Guardando…' : `${action} funcionalidad` }}</button>
      </footer>
    </form>
  </AppModal>
</template>
