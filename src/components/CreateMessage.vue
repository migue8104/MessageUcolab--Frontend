<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { catalogApi, messageApi } from '../api'
import { store } from '../store'

const emit = defineEmits(['created', 'cancel'])

const functionalities = ref([])
const success = ref('')
const formError = ref('')

const form = reactive({
  code: '',
  title: '',
  content: '',
  typeId: '',
  categoryId: '',
  statusId: '',
  functionalityId: ''
})

const context = computed(() => store.activeContext || {})

const titleCount = computed(() => form.title.length)
const contentCount = computed(() => form.content.length)
const codeCount = computed(() => form.code.trim().length)

function setCatalogDefaults() {
  if (store.types.length && !form.typeId) form.typeId = store.types[0].value
  if (store.categories.length && !form.categoryId) form.categoryId = store.categories[0].value
  if (store.states.length && !form.statusId) form.statusId = store.states[0].value
}

watch(
  [
    () => store.types.length,
    () => store.categories.length,
    () => store.states.length
  ],
  setCatalogDefaults,
  { immediate: true }
)

async function loadFunctionalities() {
  functionalities.value = []
  form.functionalityId = ''
  const appId = context.value.applicationId || context.value.application?.id
  if (!appId) return
  try {
    functionalities.value = await catalogApi.functionalities(appId)
  } catch (e) {
    store.handleUnauthorized(e)
    formError.value = e.message
  }
}

onMounted(loadFunctionalities)

async function createMessage() {
  success.value = ''
  formError.value = ''

  const payload = {
    code: form.code.trim(),
    title: form.title,
    content: form.content,
    typeId: form.typeId,
    categoryId: form.categoryId,
    statusId: form.statusId,
    functionalityId: form.functionalityId
  }

  try {
    const data = await messageApi.create(payload)
    // Consistencia eventual: no decimos "disponible", solo que fue recibido.
    alert('Mensaje creado exitosamente')
    success.value = 'Mensaje creado exitosamente'
    form.code = ''
    form.title = ''
    form.content = ''
    emit('created', data)
    setTimeout(() => {
      success.value = ''
      emit('cancel')
    }, 900)
  } catch (e) {
    store.handleUnauthorized(e)
    formError.value = e.message
  }
}
</script>

<template>
  <section class="card">
    <h2>Crear mensaje</h2>

    <h3 class="sub">{{ store.isLocalWorkspace ? 'Destino fijo de desarrollo' : 'Contexto' }}</h3>
    <dl class="ctx-summary">
      <div><dt>Organización</dt><dd>{{ context.organization?.name || context.organizationName || '—' }}</dd></div>
      <div><dt>Aplicación</dt><dd>{{ context.application?.name || context.applicationName || '—' }}</dd></div>
      <div><dt>Ambiente</dt><dd>{{ context.environment?.name || context.environmentName || '—' }}</dd></div>
    </dl>

    <h3 class="sub">Identificación</h3>
    <div class="grid">
      <label>
        Código *
        <input v-model="form.code" placeholder="WELCOME" />
        <small>{{ codeCount }}/10 · sin MSG_ ni guiones → se guarda como MSG_{{ form.code.trim().toUpperCase() }}</small>
      </label>
      <label>
        Funcionalidad *
        <select v-model="form.functionalityId" :disabled="!functionalities.length">
          <option value="">Seleccionar…</option>
          <option v-for="f in functionalities" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </label>
      <label>
        Tipo *
        <select v-model="form.typeId">
          <option v-for="t in store.types" :key="t.value" :value="t.value">{{ t.name }}</option>
        </select>
      </label>
      <label>
        Categoría *
        <select v-model="form.categoryId">
          <option v-for="c in store.categories" :key="c.value" :value="c.value">{{ c.name }}</option>
        </select>
      </label>
      <label>
        Estado *
        <select v-model="form.statusId">
          <option v-for="s in store.states" :key="s.value" :value="s.value">{{ s.name }}</option>
        </select>
      </label>
    </div>

    <h3 class="sub">Contenido</h3>
    <div class="grid">
      <label>
        Título * (10 a 50)
        <input v-model="form.title" placeholder="Credenciales incorrectas" />
        <small>{{ titleCount }}/50 caracteres</small>
      </label>
      <label class="full">
        Contenido * (10 a 100)
        <textarea v-model="form.content" rows="3" placeholder="El usuario o la contraseña ingresados no son correctos."></textarea>
        <small>{{ contentCount }}/100 caracteres</small>
      </label>
    </div>

    <p v-if="formError" class="err">{{ formError }}</p>
    <p v-if="success" class="ok" style="font-weight:700;font-size:16px">{{ success }}</p>

    <div class="toolbar">
      <button class="ghost" @click="emit('cancel')">Cancelar</button>
      <button @click="createMessage">Crear mensaje</button>
    </div>
  </section>
</template>

<style scoped>
.ctx-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 0 0 16px;
  padding: 10px 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.ctx-summary div dt {
  font-size: 12px;
  color: #6b7280;
}

.ctx-summary div dd {
  margin: 0;
  font-weight: 600;
}

button.ghost {
  background: #f3f4f6;
  color: #374151;
}

input.is-invalid,
textarea.is-invalid {
  border-color: #b91c1c;
}
</style>
