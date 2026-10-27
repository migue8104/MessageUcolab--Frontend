<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import AppIcon from './AppIcon.vue'
defineProps({ title: { type: String, required: true }, description: { type: String, default: '' }, busy: Boolean })
const emit = defineEmits(['close'])
const dialog = ref(null)
let previousFocus

function onBackdrop(event) {
  if (event.target !== dialog.value) return
  const bounds = dialog.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
    emit('close')
  }
}
onMounted(() => {
  previousFocus = document.activeElement
  dialog.value.showModal()
  const input = dialog.value.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
  if (input) input.focus()
})
onBeforeUnmount(() => {
  dialog.value?.close()
  previousFocus?.focus()
})
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="app-modal business-ui" aria-labelledby="app-modal-title" :aria-busy="busy" @cancel.prevent="!busy && emit('close')" @click="!busy && onBackdrop($event)">
      <header class="modal-heading"><div><h2 id="app-modal-title">{{ title }}</h2><p v-if="description">{{ description }}</p></div><button type="button" class="icon-button" aria-label="Cerrar" :disabled="busy" @click="emit('close')"><AppIcon name="close" /></button></header>
      <slot />
    </dialog>
  </Teleport>
</template>
