<script setup>
import { ref, reactive, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { catalogApi, messageApi } from '../api'
import { store } from '../store'
import { validateMessageFields } from '../messageForm'
import { catalogLabel, statusName, environmentTone } from '../presentation'
import PageHeader from './ui/PageHeader.vue'
import AppIcon from './ui/AppIcon.vue'
import StatusBadge from './ui/StatusBadge.vue'

const props = defineProps({
  message: { type: Object, required: true }
})
const emit = defineEmits(['updated', 'cancel'])

const functionalities = ref([])
const success = ref('')
const formError = ref('')
const saving = ref(false)
const loadingFunctionalities = ref(false)
const activeStep = ref('content')
const context = computed(() => store.activeContext || {})
const applicationId = context.value.applicationId
const originalEnvironments = ref([])
const steps = [
  { id: 'content', title: 'Contenido', description: 'Título y texto del mensaje' },
  { id: 'classification', title: 'Clasificación', description: 'Tipo, categoría y estado' },
  { id: 'environments', title: 'Ambientes', description: 'Dónde estará disponible' }
]
let active = true
let returnTimer
onBeforeUnmount(() => { active = false; clearTimeout(returnTimer) })

const form = reactive({
  title: '',
  content: '',
  typeId: '',
  categoryId: '',
  statusId: '',
  functionalityId: '',
  environmentIds: []
})

const titleCount = computed(() => form.title.length)
const contentCount = computed(() => form.content.length)
const isContextCurrent = computed(() => !!applicationId && context.value.applicationId === applicationId)
const allEnvironments = computed({
  get: () => store.environments.length > 0 && store.environments.every((env) => form.environmentIds.includes(env.id)),
  set: (checked) => { form.environmentIds = checked ? store.environments.map((env) => env.id) : [] }
})
const addedEnvironments = computed(() => store.environments.filter((env) => form.environmentIds.includes(env.id)
  && !originalEnvironments.value.some((original) => original.id === env.id)))
const removedEnvironments = computed(() => originalEnvironments.value.filter((env) => !form.environmentIds.includes(env.id)))
const environmentsChanged = computed(() => addedEnvironments.value.length > 0 || removedEnvironments.value.length > 0)

function environmentHint(env) {
  const original = originalEnvironments.value.some((item) => item.id === env.id)
  if (form.environmentIds.includes(env.id)) return original ? 'Ambiente actual' : 'Se añadirá al guardar'
  return original ? 'Se retirará al guardar' : 'No incluido'
}

function populateCatalogs(msg, preserveSelection = false) {
  const catalogs = [
    ['typeId', store.types, catalogLabel(msg.type)],
    ['categoryId', store.categories, catalogLabel(msg.category)],
    ['statusId', store.states, statusName(msg)]
  ]
  for (const [field, options, name] of catalogs) {
    if (!preserveSelection || !form[field]) {
      form[field] = msg[field] || options.find((item) => item.name === name)?.value || ''
    }
  }
}

watch(
  () => props.message,
  (msg) => {
    if (!msg) return
    form.title = msg.title || ''
    form.content = msg.content || ''
    populateCatalogs(msg)
    form.functionalityId = msg.functionalityId || ''
    originalEnvironments.value = (msg.environments || []).map((env) => ({ ...env }))
    form.environmentIds = [...new Set(originalEnvironments.value.map((env) => env.id).filter(Boolean))]
    success.value = ''
    formError.value = ''
    clearTimeout(returnTimer)
  },
  { immediate: true }
)

// Completar catálogos tardíos sin sobrescribir las selecciones que el usuario ya editó.
watch(() => [store.types, store.categories, store.states], () => populateCatalogs(props.message, true))

watch(() => [props.message, functionalities.value], ([msg, list]) => {
  form.functionalityId = msg.functionalityId || list.find((item) => item.name === msg.functionality)?.id || ''
})

async function loadFunctionalities() {
  functionalities.value = []
  if (!isContextCurrent.value) return
  loadingFunctionalities.value = true
  try {
    const list = await catalogApi.functionalities(applicationId)
    if (!active || !isContextCurrent.value) return
    functionalities.value = list
  } catch (e) {
    store.handleUnauthorized(e)
    if (active && isContextCurrent.value) formError.value = e.message
  } finally {
    loadingFunctionalities.value = false
  }
}

onMounted(loadFunctionalities)

async function updateMessage() {
  if (saving.value || success.value || loadingFunctionalities.value || store.catalogsLoading || store.catalogsError) return
  success.value = ''
  if (!isContextCurrent.value) {
    formError.value = 'La aplicación seleccionada cambió. Vuelve a abrir el mensaje para editarlo.'
    return
  }
  if (!form.environmentIds.length) {
    formError.value = 'Selecciona al menos un ambiente para el mensaje.'
    return
  }
  if (form.environmentIds.some((id) => !store.environments.some((env) => env.id === id))) {
    formError.value = 'Revisa los ambientes: selecciona únicamente los disponibles para esta aplicación.'
    return
  }
  formError.value = validateMessageFields(form)
  if (formError.value) return

  const payload = {
    title: form.title,
    content: form.content,
    typeId: form.typeId,
    categoryId: form.categoryId,
    statusId: form.statusId,
    functionalityId: form.functionalityId,
    environmentIds: [...form.environmentIds]
  }

  saving.value = true
  const messageCode = props.message.code
  try {
    await messageApi.update(messageCode, payload)
    if (!active || !isContextCurrent.value || props.message.code !== messageCode) return
    success.value = 'Mensaje y ambientes actualizados correctamente.'
    emit('updated')
    returnTimer = setTimeout(() => emit('cancel'), 800)
  } catch (e) {
    store.handleUnauthorized(e)
    if (active && isContextCurrent.value && props.message.code === messageCode) formError.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="card editor-card edit-message-card">
    <div class="editor-heading">
      <button type="button" class="icon-button soft" aria-label="Volver a mensajes" :disabled="saving" @click="emit('cancel')"><AppIcon name="back" /></button>
      <PageHeader title="Editar mensaje" description="Actualiza el contenido, la clasificación y los ambientes del mensaje.">
        <span class="edit-message-code">{{ message.code }}</span>
        <StatusBadge :status="store.states.find((item) => item.value === form.statusId)?.name || statusName(message)" />
      </PageHeader>
    </div>
    <div class="editor-layout">
      <nav class="form-steps" aria-label="Secciones de edición">
        <ol class="form-step-list">
          <li v-for="(step, index) in steps" :key="step.id">
            <a :href="`#edit-message-${step.id}`" :class="{ active: activeStep === step.id }" :aria-current="activeStep === step.id ? 'step' : undefined" @click="activeStep = step.id">
              <span class="step-marker">{{ index + 1 }}</span>
              <span class="step-copy"><strong>{{ step.title }}</strong><small>{{ step.description }}</small></span>
            </a>
          </li>
        </ol>
      </nav>
      <form class="message-form" @submit.prevent="updateMessage">
        <fieldset :disabled="saving || !!success || !isContextCurrent">
          <section id="edit-message-content" class="form-section" @focusin="activeStep = 'content'">
            <h3><span class="section-number">1</span>Contenido</h3>
            <div class="form-grid two">
              <label>Título <span class="required">*</span>
                <input v-model="form.title" required minlength="10" maxlength="50" placeholder="Ej. Registro completado" />
                <small :class="{ 'field-warning': titleCount > 0 && form.title.trim().length < 10 }">{{ titleCount }}/50 caracteres · mínimo 10</small>
              </label>
              <label>Contenido <span class="required">*</span>
                <textarea v-model="form.content" required minlength="10" maxlength="100" rows="2" placeholder="Escribe el contenido del mensaje…"></textarea>
                <small :class="{ 'field-warning': contentCount > 0 && form.content.trim().length < 10 }">{{ contentCount }}/100 caracteres · mínimo 10</small>
              </label>
            </div>
          </section>
          <section id="edit-message-classification" class="form-section" @focusin="activeStep = 'classification'">
            <h3><span class="section-number">2</span>Clasificación</h3>
            <div class="form-grid edit-classification-grid">
              <label>Funcionalidad <span class="required">*</span>
                <select v-model="form.functionalityId" required :disabled="loadingFunctionalities || !functionalities.length">
                  <option value="">{{ loadingFunctionalities ? 'Cargando…' : 'Seleccionar…' }}</option>
                  <option v-for="item in functionalities" :key="item.id" :value="item.id">{{ item.name }}</option>
                </select>
              </label>
              <label>Tipo <span class="required">*</span>
                <select v-model="form.typeId" required :disabled="store.catalogsLoading"><option value="" disabled>Seleccionar…</option><option v-for="item in store.types" :key="item.value" :value="item.value">{{ item.name }}</option></select>
              </label>
              <label>Categoría <span class="required">*</span>
                <select v-model="form.categoryId" required :disabled="store.catalogsLoading"><option value="" disabled>Seleccionar…</option><option v-for="item in store.categories" :key="item.value" :value="item.value">{{ item.name }}</option></select>
              </label>
              <label>Estado <span class="required">*</span>
                <select v-model="form.statusId" required :disabled="store.catalogsLoading"><option value="" disabled>Seleccionar…</option><option v-for="item in store.states" :key="item.value" :value="item.value">{{ item.name }}</option></select>
              </label>
            </div>
          </section>
          <section id="edit-message-environments" class="form-section" @focusin="activeStep = 'environments'">
            <div class="edit-section-heading"><h3><span class="section-number">3</span>Ambientes <span class="required">*</span></h3><span>{{ form.environmentIds.length }} de {{ store.environments.length }} seleccionados</span></div>
            <div class="environment-options" role="group" aria-label="Ambientes del mensaje" aria-describedby="edit-environments-help">
              <label class="environment-option environment-theme all" :class="{ selected: allEnvironments }">
                <span class="environment-option-copy"><span class="environment-option-name"><AppIcon name="grid" :size="15" />Todos</span><small>Incluir todos los ambientes</small></span>
                <input v-model="allEnvironments" type="checkbox" :indeterminate.prop="form.environmentIds.length > 0 && !allEnvironments" :disabled="!store.environments.length" />
              </label>
              <label v-for="env in store.environments" :key="env.id" class="environment-option environment-theme" :class="[environmentTone(env.name), { selected: form.environmentIds.includes(env.id) }]">
                <span class="environment-option-copy"><span class="environment-option-name"><span class="environment-dot" aria-hidden="true"></span>{{ env.name }}</span><small>{{ environmentHint(env) }}</small></span>
                <input v-model="form.environmentIds" type="checkbox" :value="env.id" />
              </label>
            </div>
            <p id="edit-environments-help" class="edit-environments-help">Marca dónde debe estar disponible el mensaje. Al guardar, se retirará de los ambientes desmarcados. Debe quedar al menos uno.</p>
            <p v-if="!store.environments.length" class="warn edit-environments-help">La aplicación no tiene ambientes disponibles.</p>
            <p v-if="environmentsChanged" class="edit-environment-changes" role="status"><span v-if="addedEnvironments.length"><AppIcon name="plus" :size="13" />Añadir: {{ addedEnvironments.map((env) => env.name).join(', ') }}</span><span v-if="removedEnvironments.length"><AppIcon name="back" :size="13" />Retirar: {{ removedEnvironments.map((env) => env.name).join(', ') }}</span></p>
          </section>
        </fieldset>
        <p v-if="formError || store.catalogsError" class="alert error" role="alert">{{ formError || store.catalogsError }}</p>
        <p v-if="success" class="alert success" role="status">{{ success }}</p>
        <footer class="form-actions">
          <span class="edit-context"><AppIcon name="building" :size="14" />{{ context.organizationName }} / {{ context.applicationName }}</span>
          <button type="button" class="secondary" :disabled="saving" @click="emit('cancel')">Cancelar</button>
          <button type="submit" :disabled="saving || !!success || loadingFunctionalities || store.catalogsLoading || !!store.catalogsError || !form.environmentIds.length || !isContextCurrent"><AppIcon name="check" :size="16" />{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
        </footer>
      </form>
    </div>
  </section>
</template>

<style scoped>
.editor-heading .page-header { flex: 1; align-items: center; min-width: 0; }
.edit-message-code { align-self: center; padding: 6px 9px; border: 1px solid var(--line); border-radius: 6px; color: var(--ink); background: #f8faff; font-size: 11px; font-weight: 650; overflow-wrap: anywhere; }
.business-ui .edit-classification-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.edit-section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
.edit-section-heading > span, .edit-environments-help { color: var(--muted); font-size: 10px; line-height: 1.6; }
.edit-environments-help { margin: 9px 0 0; }
.edit-environment-changes { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 8px 0 0; color: var(--blue); font-size: 11px; }
.edit-environment-changes > span, .edit-context { display: inline-flex; align-items: center; gap: 6px; }
.edit-context { min-width: 0; margin-right: auto; color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
@media (max-width: 1180px) {
  .business-ui .edit-classification-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .edit-message-card .editor-heading .page-header { align-items: flex-start; }
  .edit-message-card .form-actions { flex-wrap: wrap; }
  .edit-context { flex-basis: 100%; }
}
@media (max-width: 540px) {
  .business-ui .edit-classification-grid { grid-template-columns: 1fr; }
}
</style>
