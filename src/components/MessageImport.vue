<script setup>
import { ref } from 'vue'
import { messageImportApi } from '../api'
import { downloadBlob } from '../download'
import { store } from '../store'
import AppIcon from './ui/AppIcon.vue'
import MessageImportWizard from './MessageImportWizard.vue'
import '../messageImport.css'

defineProps({ disabled: Boolean })
const emit = defineEmits(['imported', 'view'])
const open = ref(false)
const downloading = ref(false)
const error = ref('')

async function template() {
  if (downloading.value) return
  error.value = ''
  downloading.value = true
  try {
    downloadBlob(await messageImportApi.template(), 'plantilla-mensajes.xlsx')
  } catch (e) {
    store.handleUnauthorized(e)
    error.value = e.status === 403 ? 'Tu sesión no tiene acceso a la ruta de importación. Su permiso debe habilitarse en el PEP de seguridad.' : e.message
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <aside class="import-strip" aria-label="Importación masiva de mensajes">
    <span class="import-strip-icon"><AppIcon name="upload" :size="22" /></span>
    <div class="import-strip-copy"><strong>Importación masiva</strong><small>Crea varios mensajes desde Excel, con validación antes de guardar.</small></div>
    <div class="import-strip-actions">
      <button type="button" class="secondary" :disabled="disabled || downloading" @click="template"><AppIcon name="download" :size="15" />{{ downloading ? 'Descargando…' : 'Descargar plantilla' }}</button>
      <button type="button" class="soft" :disabled="disabled" @click="open = true"><AppIcon name="upload" :size="15" />Importar Excel</button>
    </div>
    <p v-if="error" class="import-strip-error" role="alert">{{ error }}</p>
  </aside>
  <MessageImportWizard v-if="open" @close="open = false" @imported="emit('imported', $event)" @view="open = false; emit('view')" />
</template>
