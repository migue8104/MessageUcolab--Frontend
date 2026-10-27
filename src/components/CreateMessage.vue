<script setup>
import { ref, reactive, watch, onMounted, computed, onBeforeUnmount } from 'vue'
import { catalogApi, messageApi, toMessageCode } from '../api'
import { store } from '../store'
import { validateMessageFields } from '../messageForm'
import { environmentTone } from '../presentation'
import PageHeader from './ui/PageHeader.vue'
import AppIcon from './ui/AppIcon.vue'
import FunctionalityModal from './FunctionalityModal.vue'

const emit = defineEmits(['created', 'cancel'])
const functionalities = ref([])
const success = ref('')
const formError = ref('')
const functionalityNotice = ref('')
const loadingFunctionalities = ref(false)
const saving = ref(false)
const showFunctionality = ref(false)
const activeStep = ref('context')
let returnTimer
const form = reactive({ code: '', title: '', content: '', typeId: '', categoryId: '', statusId: '', functionalityId: '', environmentIds: [] })
const context = computed(() => store.activeContext || {})
const activeFunctionalities = computed(() => functionalities.value.filter((item) => item.active === true))

watch(activeFunctionalities, (list) => {
  if (form.functionalityId && !list.some((item) => item.id === form.functionalityId)) {
    form.functionalityId = ''
  }
})
const codeInput = computed({
  get: () => form.code,
  set: (value) => { form.code = value.toUpperCase().replace(/^MSG_+/, '') }
})
const allEnvironments = computed({
  get: () => store.environments.length > 0 && form.environmentIds.length === store.environments.length,
  set: (checked) => { form.environmentIds = checked ? store.environments.map((env) => env.id) : [] }
})
const steps = [
  { id: 'context', title: 'Contexto', description: 'Organización y aplicación' },
  { id: 'environments', title: 'Ambientes', description: 'Dónde estará disponible' },
  { id: 'identification', title: 'Identificación', description: 'Define la funcionalidad' },
  { id: 'content', title: 'Contenido', description: 'Escribe el mensaje' }
]

function setEnvironmentDefaults() {
  if (form.environmentIds.length || !store.environments.length) return
  const develop = store.environments.find((env) => env.name?.toLowerCase() === 'develop')
  form.environmentIds = [(develop || store.environments[0]).id]
}
watch(() => store.environments.length, setEnvironmentDefaults, { immediate: true })
watch(() => [store.types.length, store.categories.length, store.states.length], () => {
  if (!form.typeId) form.typeId = store.types[0]?.value || ''
  if (!form.categoryId) form.categoryId = store.categories[0]?.value || ''
  if (!form.statusId) form.statusId = store.states[0]?.value || ''
}, { immediate: true })

async function loadFunctionalities() {
  loadingFunctionalities.value = true
  try {
    functionalities.value = await catalogApi.functionalities(context.value.applicationId)
  } catch (e) {
    store.handleUnauthorized(e)
    formError.value = e.message
  } finally {
    loadingFunctionalities.value = false
  }
}
function onFunctionalityCreated({ functionality, functionalities: list }) {
  functionalities.value = list
  functionalityNotice.value = ''
  if (activeFunctionalities.value.some((item) => item.id === functionality.id)) {
    form.functionalityId = functionality.id
  } else {
    functionalityNotice.value = 'La funcionalidad se creó inactiva. Está disponible en Configuración, pero no se puede seleccionar para crear mensajes.'
  }
  showFunctionality.value = false
}
onMounted(loadFunctionalities)
onBeforeUnmount(() => clearTimeout(returnTimer))

async function createMessage() {
  if (saving.value || success.value) return
  success.value = ''
  formError.value = ''
  if (!/^[A-Z0-9 ]{1,10}$/.test(form.code.trim())) return (formError.value = 'El código debe tener entre 1 y 10 letras, números o espacios, sin el prefijo MSG_.')
  if (!form.environmentIds.length) return (formError.value = 'Selecciona al menos un ambiente.')
  if (!activeFunctionalities.value.some((item) => item.id === form.functionalityId)) {
    formError.value = 'Selecciona una funcionalidad activa de la aplicación.'
    return
  }
  formError.value = validateMessageFields(form)
  if (formError.value) return
  saving.value = true
  try {
    const data = await messageApi.create({ ...form, code: toMessageCode(form.code).slice(4), environmentIds: [...form.environmentIds] })
    const names = store.environments.filter((env) => form.environmentIds.includes(env.id)).map((env) => env.name).join(', ')
    success.value = `Mensaje creado en: ${names}`
    emit('created', data)
    returnTimer = setTimeout(() => emit('cancel'), 900)
  } catch (e) {
    store.handleUnauthorized(e)
    formError.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="card editor-card">
    <div class="editor-heading">
      <button class="icon-button soft" aria-label="Volver a mensajes" @click="emit('cancel')"><AppIcon name="back" /></button>
      <PageHeader title="Crear mensaje" description="Configura el contenido del mensaje y define su contexto de aplicación." />
    </div>
    <div class="editor-layout">
      <nav class="form-steps" aria-label="Secciones del formulario">
        <ol class="form-step-list">
          <li v-for="(step, index) in steps" :key="step.id">
            <a :href="`#message-${step.id}`" :class="{ active: activeStep === step.id }" :aria-current="activeStep === step.id ? 'step' : undefined" @click="activeStep = step.id">
              <span class="step-marker">{{ index + 1 }}</span>
              <span class="step-copy"><strong>{{ step.title }}</strong><small>{{ step.description }}</small></span>
            </a>
          </li>
        </ol>
      </nav>
      <form class="message-form" @submit.prevent="createMessage">
        <fieldset :disabled="saving || !!success">
          <section id="message-context" class="form-section" @focusin="activeStep = 'context'">
            <h3><span class="section-number">1</span>Contexto</h3>
            <div class="form-grid two">
              <label>Organización <span class="required">*</span><input :value="context.organizationName" readonly /></label>
              <label>Aplicación <span class="required">*</span><input :value="context.applicationName" readonly /></label>
            </div>
          </section>
          <section id="message-environments" class="form-section" @focusin="activeStep = 'environments'">
            <h3><span class="section-number">2</span>Ambientes <span class="required">*</span></h3>
            <div class="environment-options" role="group" aria-label="Ambientes del mensaje">
              <label class="environment-option environment-theme all" :class="{ selected: allEnvironments }">
                <span class="environment-option-copy">
                  <span class="environment-option-name"><AppIcon name="grid" :size="15" />Todos</span>
                  <small>{{ form.environmentIds.length }} de {{ store.environments.length }} ambientes</small>
                </span>
                <input v-model="allEnvironments" type="checkbox" :indeterminate.prop="form.environmentIds.length > 0 && !allEnvironments" :disabled="!store.environments.length" />
              </label>
              <label v-for="env in store.environments" :key="env.id" class="environment-option environment-theme" :class="[environmentTone(env.name), { selected: form.environmentIds.includes(env.id) }]">
                <span class="environment-option-copy">
                  <span class="environment-option-name"><span class="environment-dot" aria-hidden="true"></span>{{ env.name }}</span>
                  <small>{{ form.environmentIds.includes(env.id) ? 'Seleccionado' : 'Incluir ambiente' }}</small>
                </span>
                <input v-model="form.environmentIds" type="checkbox" :value="env.id" />
              </label>
            </div>
            <small v-if="!store.environments.length" class="warn">La aplicación no tiene ambientes disponibles.</small>
          </section>
          <section id="message-identification" class="form-section" @focusin="activeStep = 'identification'">
            <h3><span class="section-number">3</span>Identificación</h3>
            <div class="form-grid identification-grid">
              <label>
                Código <span class="required">*</span>
                <div class="input-prefix">
                  <span>MSG_</span>
                  <input v-model="codeInput" required maxlength="10" pattern="[A-Za-z0-9 ]{1,10}" title="Entre 1 y 10 letras, números o espacios; sin guiones." placeholder="WELCOME" />
                </div>
                <small>{{ form.code.length }}/10 · Se guarda como {{ toMessageCode(form.code) || 'MSG_…' }}</small>
              </label>
              <div class="field functionality-field">
                <label for="message-functionality">Funcionalidad <span class="required">*</span></label>
                <div class="inline-field">
                  <select id="message-functionality" v-model="form.functionalityId" required :disabled="loadingFunctionalities">
                    <option value="">{{ loadingFunctionalities ? 'Cargando…' : activeFunctionalities.length ? 'Seleccionar…' : 'No hay funcionalidades activas' }}</option>
                    <option v-for="item in activeFunctionalities" :key="item.id" :value="item.id">{{ item.name }}</option>
                  </select>
                  <button type="button" class="soft" :disabled="!context.applicationId" @click="showFunctionality = true"><AppIcon name="plus" :size="16" />Nueva</button>
                </div>
              </div>
            </div>
            <div class="form-grid three">
              <label>Tipo <span class="required">*</span>
                <select v-model="form.typeId" required><option v-for="item in store.types" :key="item.value" :value="item.value">{{ item.name }}</option></select>
              </label>
              <label>Categoría <span class="required">*</span>
                <select v-model="form.categoryId" required><option v-for="item in store.categories" :key="item.value" :value="item.value">{{ item.name }}</option></select>
              </label>
              <label>Estado <span class="required">*</span>
                <select v-model="form.statusId" required><option v-for="item in store.states" :key="item.value" :value="item.value">{{ item.name }}</option></select>
              </label>
            </div>
          </section>
          <section id="message-content" class="form-section" @focusin="activeStep = 'content'">
            <h3><span class="section-number">4</span>Contenido</h3>
            <div class="form-grid two">
              <label>Título <span class="required">*</span>
                <input v-model="form.title" required minlength="10" maxlength="50" placeholder="Ej. Credenciales incorrectas" />
                <small :class="{ 'field-warning': form.title.length > 0 && form.title.trim().length < 10 }">{{ form.title.length }}/50 caracteres · mínimo 10</small>
              </label>
              <label>Contenido <span class="required">*</span>
                <textarea v-model="form.content" required minlength="10" maxlength="100" rows="2" placeholder="Escribe el contenido del mensaje…"></textarea>
                <small :class="{ 'field-warning': form.content.length > 0 && form.content.trim().length < 10 }">{{ form.content.length }}/100 caracteres · mínimo 10</small>
              </label>
            </div>
          </section>
        </fieldset>
        <p v-if="formError || store.catalogsError" class="alert error" role="alert">{{ formError || store.catalogsError }}</p>
        <p v-if="functionalityNotice" class="alert notice" role="status">{{ functionalityNotice }}</p>
        <p v-if="success" class="alert success" role="status">{{ success }}</p>
        <footer class="form-actions">
          <button type="button" class="secondary" :disabled="saving" @click="emit('cancel')">Cancelar</button>
          <button type="submit" :disabled="saving || !!success || loadingFunctionalities || store.catalogsLoading"><AppIcon name="send" :size="16" />{{ saving ? 'Creando…' : 'Crear mensaje' }}</button>
        </footer>
      </form>
    </div>
    <FunctionalityModal v-if="showFunctionality" :application-id="context.applicationId" :application-name="context.applicationName" @close="showFunctionality = false" @created="onFunctionalityCreated" />
  </section>
</template>
