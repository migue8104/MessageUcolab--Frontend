<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { messageImportApi } from '../api'
import { downloadBlob } from '../download'
import { store } from '../store'
import { environmentTone, catalogLabel } from '../presentation'
import AppModal from './ui/AppModal.vue'
import AppIcon from './ui/AppIcon.vue'

const emit = defineEmits(['close', 'imported', 'view'])
const context = computed(() => store.activeContext || {})
const applicationId = context.value.applicationId
const step = ref(1)
const busy = ref(false)
const downloading = ref(false)
const error = ref('')
const file = ref(null)
const fileInput = ref(null)
const dragging = ref(false)
const preview = ref(null)
const receipt = ref(null)
const filter = ref('all')
const page = ref(1)
const detail = ref(null)
const detailBackButton = ref(null)
const detailButtons = new Map()
const productionConfirmed = ref(false)
const unknownOutcome = ref(false)
const recovering = ref(false)
const pendingKey = `message-import-pending:${applicationId}`
const pageSize = ref(window.innerHeight < 800 ? 4 : 5)
const develop = store.environments.find((env) => env.name?.toLowerCase() === 'develop')
const environmentIds = ref(develop ? [develop.id] : [])
const fields = { code: 'Código', functionality: 'Funcionalidad', type: 'Tipo', category: 'Categoría', status: 'Estado', title: 'Título', content: 'Contenido', environments: 'Ambientes' }
const referenceFields = ['functionality', 'type', 'category', 'status']
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const referenceId = new RegExp(uuidPattern, 'i')
const steps = ['Archivo y ambientes', 'Validación', 'Resultado']
const selectedEnvironments = computed(() => store.environments.filter((env) => environmentIds.value.includes(env.id)))
const environmentNames = computed(() => selectedEnvironments.value.map((env) => env.name).join(', '))
const hasProduction = computed(() => selectedEnvironments.value.some((env) => environmentTone(env.name) === 'production'))
const errorCount = computed(() => preview.value?.rows.filter((row) => row.issues.length).length || 0)
const total = computed(() => preview.value?.rows.length || 0)
const filteredRows = computed(() => (preview.value?.rows || []).filter((row) => filter.value !== 'errors' || row.issues.length))
const pages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)))
const visibleRows = computed(() => filteredRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const confirmDisabled = computed(() => busy.value || downloading.value || errorCount.value > 0 || !total.value || (hasProduction.value && !productionConfirmed.value))
const isContextCurrent = () => context.value.applicationId === applicationId

function referenceName(value, field) {
  const name = (value || '').trim()
  if (referenceId.test(name)) return 'Referencia inválida: usa el nombre del catálogo'
  return (['type', 'category', 'status'].includes(field) ? catalogLabel(name) : name) || 'Sin valor'
}

function fieldValue(row, field) {
  return referenceFields.includes(field) ? referenceName(row[field], field) : row[field] || 'Sin valor'
}

function setDetailButton(rowNumber, button) {
  if (button) detailButtons.set(rowNumber, button)
  else detailButtons.delete(rowNumber)
}

async function openDetail(result) {
  detail.value = result
  await nextTick()
  detailBackButton.value?.focus()
}

async function backToList() {
  const rowNumber = detail.value.row.rowNumber
  detail.value = null
  await nextTick()
  detailButtons.get(rowNumber)?.focus()
}

watch(filter, () => { page.value = 1; detail.value = null })
watch(environmentIds, () => { preview.value = null; productionConfirmed.value = false; error.value = '' })
watch(() => context.value.applicationId, () => { if (!busy.value) emit('close') })

function resize() { pageSize.value = window.innerHeight < 800 ? 4 : 5; page.value = 1 }
onMounted(() => { window.addEventListener('resize', resize); recoverPending() })
onBeforeUnmount(() => window.removeEventListener('resize', resize))

function explain(e) {
  store.handleUnauthorized(e)
  if (e.status === 403) return 'Tu sesión no tiene acceso a esta ruta de importación. Su permiso debe habilitarse en el PEP de seguridad.'
  return e.message || 'No fue posible completar la solicitud.'
}

function pendingImport(value) {
  try {
    if (value === undefined) return sessionStorage.getItem(pendingKey)
    if (value) sessionStorage.setItem(pendingKey, value)
    else sessionStorage.removeItem(pendingKey)
  } catch { /* The current modal still supports safe retries when browser storage is unavailable. */ }
  return null
}

async function recoverPending() {
  const id = pendingImport()
  if (!id) return
  busy.value = true
  recovering.value = true
  try {
    const completed = await messageImportApi.result(id)
    const draft = completed ? null : await messageImportApi.preview(id)
    environmentIds.value = [...(completed || draft).environmentIds]
    await nextTick()
    if (completed) {
      receipt.value = completed
      step.value = 3
      pendingImport(null)
      emit('imported', completed)
    } else {
      preview.value = draft
      step.value = 2
      error.value = 'Se recuperó una confirmación pendiente. Revisa el lote antes de reintentar; no se ha enviado una nueva importación automáticamente.'
    }
  } catch (e) {
    error.value = explain(e)
    if (e.status === 422) pendingImport(null)
  } finally {
    busy.value = false
    recovering.value = false
  }
}

function chooseFile(candidate) {
  dragging.value = false
  if (busy.value || !candidate) return
  error.value = ''
  preview.value = null
  productionConfirmed.value = false
  if (!/\.xlsx$/i.test(candidate.name) || candidate.size > 5 * 1024 * 1024 || candidate.size === 0) {
    file.value = null
    error.value = 'Selecciona un archivo .xlsx no vacío de hasta 5 MB.'
    return
  }
  file.value = candidate
}

function onDrop(event) {
  if (event.dataTransfer.files.length !== 1) {
    dragging.value = false
    error.value = 'Selecciona un solo archivo por importación.'
    return
  }
  chooseFile(event.dataTransfer.files[0])
}

async function download(kind) {
  if (downloading.value || busy.value) return
  downloading.value = true
  error.value = ''
  try {
    const report = kind === 'report'
    const blob = report ? await messageImportApi.report(preview.value.importId) : await messageImportApi.template()
    downloadBlob(blob, report ? 'errores-importacion.xlsx' : 'plantilla-mensajes.xlsx')
  } catch (e) {
    error.value = explain(e)
  } finally {
    downloading.value = false
  }
}

async function validate() {
  if (busy.value || !file.value || !environmentIds.value.length || !isContextCurrent()) return
  error.value = ''
  busy.value = true
  try {
    preview.value = await messageImportApi.validate(file.value, [...environmentIds.value])
    if (!isContextCurrent()) { emit('close'); return }
    page.value = 1
    filter.value = 'all'
    detail.value = null
    step.value = 2
  } catch (e) {
    error.value = explain(e)
  } finally {
    busy.value = false
  }
}

async function confirm() {
  if (confirmDisabled.value || !isContextCurrent()) return
  error.value = ''
  busy.value = true
  try {
    pendingImport(preview.value.importId)
    receipt.value = await messageImportApi.confirm(preview.value.importId, productionConfirmed.value)
    pendingImport(null)
    unknownOutcome.value = false
    step.value = 3
    emit('imported', receipt.value)
  } catch (e) {
    const message = explain(e)
    unknownOutcome.value = !e.status || e.status >= 500
    if (e.status === 422 || e.status === 409) {
      pendingImport(null)
      try {
        preview.value = await messageImportApi.preview(preview.value.importId)
        detail.value = null
        page.value = 1
        if (errorCount.value) filter.value = 'errors'
      } catch { /* Keep the original confirmation error. */ }
    }
    error.value = unknownOutcome.value
      ? 'No se pudo conocer el resultado. Reintenta esta misma confirmación: el servidor recuperará el lote si ya se guardó, sin duplicarlo.'
      : message
  } finally {
    busy.value = false
  }
}

function replaceFile() {
  if (busy.value || unknownOutcome.value) return
  preview.value = null
  detail.value = null
  error.value = ''
  productionConfirmed.value = false
  step.value = 1
}

function close() {
  if (busy.value) return
  if (unknownOutcome.value && !window.confirm('El resultado del lote aún no se conoce. Es mejor reintentar la confirmación antes de salir. ¿Quieres cerrar de todos modos?')) return
  emit('close')
}

function newImport() {
  file.value = null
  receipt.value = null
  filter.value = 'all'
  replaceFile()
}
</script>

<template>
  <AppModal title="Importar mensajes" description="Desde Excel, con validación completa antes de guardar." wide :busy="busy || downloading" @close="close">
    <div class="import-wizard">
      <ol class="import-steps" aria-label="Pasos de importación">
        <li v-for="(label, index) in steps" :key="label" :class="{ current: step === index + 1, complete: step > index + 1 }" :aria-current="step === index + 1 ? 'step' : undefined"><span><AppIcon v-if="step > index + 1" name="check" :size="14" /><template v-else>{{ index + 1 }}</template></span>{{ label }}</li>
      </ol>
      <div class="import-context"><span><small>Organización</small><strong>{{ context.organizationName }}</strong></span><span><small>Aplicación</small><strong>{{ context.applicationName }}</strong></span><span v-if="step > 1"><small>Ambientes del lote</small><strong>{{ environmentNames }}</strong></span></div>

      <template v-if="step === 1">
        <div class="import-environments">
          <h3>¿Dónde estarán disponibles estos mensajes? <span class="required">*</span></h3>
          <div class="environment-options">
            <label v-for="env in store.environments" :key="env.id" class="environment-option environment-theme" :class="[environmentTone(env.name), { selected: environmentIds.includes(env.id) }]">
              <span class="environment-option-copy"><span class="environment-option-name"><span class="environment-dot" aria-hidden="true"></span>{{ env.name }}</span><small>{{ environmentIds.includes(env.id) ? 'Seleccionado' : 'Incluir ambiente' }}</small></span>
              <input v-model="environmentIds" type="checkbox" :value="env.id" :disabled="busy" />
            </label>
          </div>
          <small>Los ambientes seleccionados se aplican a todas las filas. No se escriben en el Excel.</small>
        </div>
        <div class="import-dropzone" :class="{ dragging, 'has-file': file }" @dragover.prevent="dragging = !busy" @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
          <span class="import-drop-icon"><AppIcon :name="file ? 'file' : 'upload'" :size="27" /></span>
          <div><strong>{{ file ? file.name : 'Arrastra aquí tu archivo Excel' }}</strong><p>{{ file ? `${(file.size / 1024).toFixed(1)} KB · Listo para validar` : 'O selecciónalo desde tu equipo' }}</p><small>.xlsx · Hasta 500 mensajes · Máximo 5 MB</small></div>
          <button type="button" class="secondary" :disabled="busy" @click="fileInput.click()">{{ file ? 'Cambiar archivo' : 'Elegir archivo' }}</button>
          <input ref="fileInput" class="visually-hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" tabindex="-1" aria-label="Seleccionar Excel" @change="chooseFile($event.target.files[0]); $event.target.value = ''" />
        </div>
        <div class="import-hint"><AppIcon name="shield" :size="17" /><p><strong>Primero revisamos, después importas.</strong> La validación no guarda mensajes. Solo se crean mensajes nuevos; no se sobrescriben códigos ni se crean funcionalidades.</p></div>
        <p v-if="hasProduction" class="import-production-note"><AppIcon name="warning" :size="16" />El lote incluye Produccion. Deberás confirmarlo expresamente antes de guardar.</p>
      </template>

      <template v-else-if="step === 2">
        <template v-if="!detail">
          <div class="import-summary" aria-live="polite"><div><strong>{{ total }}</strong><span>mensajes detectados</span></div><div class="valid"><strong>{{ total - errorCount }}</strong><span>válidos</span></div><div :class="{ invalid: errorCount }"><strong>{{ errorCount }}</strong><span>con errores</span></div></div>
          <div class="import-table-toolbar"><div class="import-filters" aria-label="Filtrar filas"><button type="button" :class="{ selected: filter === 'all' }" :aria-pressed="filter === 'all'" @click="filter = 'all'">Todos</button><button type="button" :class="{ selected: filter === 'errors' }" :aria-pressed="filter === 'errors'" @click="filter = 'errors'">Con errores <span>{{ errorCount }}</span></button></div><small>Validación disponible durante 30 minutos</small></div>
          <div class="import-table-wrap">
            <table class="import-table"><caption class="visually-hidden">Vista previa de mensajes y errores por fila</caption><thead><tr><th>Fila</th><th>Código final</th><th>Funcionalidad</th><th>Resultado</th><th><span class="visually-hidden">Detalle</span></th></tr></thead><tbody>
              <tr v-for="result in visibleRows" :key="result.row.rowNumber"><td>{{ result.row.rowNumber }}</td><td class="import-code">{{ result.normalizedCode }}</td><td class="import-functionality" :title="referenceName(result.row.functionality)">{{ referenceName(result.row.functionality) }}</td><td><span class="import-row-status" :class="result.issues.length ? 'invalid' : 'valid'"><AppIcon :name="result.issues.length ? 'warning' : 'check'" :size="14" />{{ result.issues.length ? `${result.issues.length} ${result.issues.length === 1 ? 'error' : 'errores'}` : 'Válido' }}</span></td><td><button :ref="(button) => setDetailButton(result.row.rowNumber, button)" type="button" class="import-detail-button" :aria-label="`Ver detalle de fila ${result.row.rowNumber}`" @click="openDetail(result)">Ver detalle</button></td></tr>
              <tr v-if="!visibleRows.length"><td colspan="5" class="import-empty">No hay filas con errores.</td></tr>
            </tbody></table>
          </div>
          <div class="import-pagination"><small>{{ filteredRows.length }} {{ filteredRows.length === 1 ? 'fila' : 'filas' }} · Página {{ page }} de {{ pages }}</small><div><button type="button" class="secondary" :disabled="page <= 1" aria-label="Página anterior" @click="page--"><AppIcon name="back" :size="14" /></button><button type="button" class="secondary" :disabled="page >= pages" aria-label="Página siguiente" @click="page++"><AppIcon name="arrow" :size="14" /></button></div></div>
          <p class="import-validation-note" :class="{ 'has-errors': errorCount }"><AppIcon :name="errorCount ? 'warning' : 'shield'" :size="16" />{{ errorCount ? 'Corrige todas las filas con errores y vuelve a validar. No se ha guardado ningún mensaje.' : `Se crearán ${total} mensajes en ${environmentNames}. Se volverán a comprobar las referencias y los códigos al confirmar.` }}</p>
          <label v-if="hasProduction && !errorCount" class="import-production-confirm"><input v-model="productionConfirmed" type="checkbox" :disabled="busy || unknownOutcome" /><span>Confirmo que deseo crear estos {{ total }} mensajes también en <strong>Produccion</strong>.</span></label>
        </template>
        <section v-else class="import-detail">
          <button ref="detailBackButton" type="button" class="secondary import-detail-back" @click="backToList"><AppIcon name="back" :size="18" />Volver al listado</button>
          <h3>Fila {{ detail.row.rowNumber }} · {{ detail.normalizedCode }}</h3>
          <dl class="import-detail-fields"><div v-for="(label, field) in fields" v-show="field !== 'environments'" :key="field"><dt>{{ label }}</dt><dd>{{ fieldValue(detail.row, field) }}<span v-for="issue in detail.issues.filter((item) => item.field === field)" :key="issue.message" class="import-field-error">{{ issue.message }}</span></dd></div></dl>
        </section>
      </template>

      <section v-else class="import-result" aria-live="polite"><span class="import-result-icon"><AppIcon name="check" :size="34" /></span><h3>{{ receipt.count }} mensajes importados</h3><p>Disponibles en <strong>{{ environmentNames }}</strong>.</p><small>Se creó un único mensaje por código, enlazado a los ambientes seleccionados.</small><div class="import-result-meta"><span>Aplicación <strong>{{ context.applicationName }}</strong></span><span>Lote <code>{{ receipt.importId.slice(0, 8) }}</code></span></div></section>

      <p v-if="error" class="alert error import-error" role="alert">{{ error }}</p>
      <footer class="import-footer">
        <template v-if="step === 1"><button type="button" class="secondary" :disabled="busy || downloading" @click="download('template')"><AppIcon name="download" :size="15" />{{ downloading ? 'Descargando…' : 'Descargar plantilla' }}</button><div><button type="button" class="secondary" :disabled="busy || downloading" @click="close">Cancelar</button><button type="button" :disabled="busy || downloading || !file || !environmentIds.length" @click="validate">{{ recovering ? 'Recuperando lote…' : busy ? 'Validando…' : 'Validar archivo' }}<AppIcon name="arrow" :size="15" /></button></div></template>
        <template v-else-if="step === 2"><div><button type="button" class="secondary" :disabled="busy || downloading || unknownOutcome" @click="replaceFile">Cambiar archivo o ambientes</button><button v-if="errorCount" type="button" class="soft" :disabled="busy || downloading" @click="download('report')"><AppIcon name="download" :size="15" />{{ downloading ? 'Descargando…' : 'Descargar errores' }}</button></div><button type="button" :disabled="confirmDisabled" @click="confirm"><AppIcon name="upload" :size="15" />{{ busy ? 'Importando…' : unknownOutcome ? 'Reintentar confirmación' : `Importar ${total} mensajes` }}</button></template>
        <template v-else><button type="button" class="secondary" @click="newImport"><AppIcon name="plus" :size="15" />Nueva importación</button><button type="button" @click="emit('view')">Ver mensajes<AppIcon name="arrow" :size="15" /></button></template>
      </footer>
    </div>
  </AppModal>
</template>
