<script setup>
import { ref, reactive, watch } from 'vue'
import { catalogApi, messageApi } from '../api'
import { store } from '../store'

const emit = defineEmits(['created'])

const environments = ref([])
const functionalities = ref([])

const formError = ref('')
const success = ref('')

const form = reactive({
  code: '',
  title: '',
  content: '',
  typeId: '',
  categoryId: '',
  statusId: '',
  messageEnvironmentStateId: '',
  applicationId: '',
  functionalityId: '',
  environmentId: ''
})

// Cuando los catálogos del store llegan, seleccionamos valores por defecto
// solo si el usuario aún no eligió uno.
function setCatalogDefaults() {
  if (store.types.length && !form.typeId) form.typeId = store.types[0].value
  if (store.categories.length && !form.categoryId) form.categoryId = store.categories[0].value
  if (store.states.length && !form.statusId) form.statusId = store.states[0].value
  if (store.envStates.length && !form.messageEnvironmentStateId)
    form.messageEnvironmentStateId = store.envStates[0].value
}

watch(
  [
    () => store.types.length,
    () => store.categories.length,
    () => store.states.length,
    () => store.envStates.length
  ],
  setCatalogDefaults,
  { immediate: true }
)

async function onAppChange() {
  form.functionalityId = ''
  form.environmentId = ''
  environments.value = []
  functionalities.value = []
  formError.value = ''
  if (!form.applicationId) return
  try {
    const [envs, funcs] = await Promise.all([
      catalogApi.environments(form.applicationId),
      catalogApi.functionalities(form.applicationId)
    ])
    environments.value = envs
    functionalities.value = funcs
  } catch (e) {
    formError.value = 'Error cargando entorno/funcionalidad: ' + e.message
  }
}

async function createMessage() {
  formError.value = ''
  success.value = ''

  if (!form.code) return (formError.value = 'El código no puede estar vacío.')
  if (form.title.length < 10 || form.title.length > 50)
    return (formError.value = 'El título debe tener entre 10 y 50 caracteres.')
  if (form.content.length < 10 || form.content.length > 100)
    return (formError.value = 'El contenido debe tener entre 10 y 100 caracteres.')
  if (!form.applicationId || !form.environmentId || !form.functionalityId)
    return (formError.value = 'Selecciona aplicación, entorno y funcionalidad.')

  const app = store.applications.find((a) => a.id === form.applicationId)

  const payload = {
    code: form.code,
    title: form.title,
    content: form.content,
    typeId: form.typeId,
    categoryId: form.categoryId,
    statusId: form.statusId,
    applicationId: form.applicationId,
    application: app ? app.name : '',
    functionalityId: form.functionalityId,
    environmentId: form.environmentId,
    messageEnvironmentStateId: form.messageEnvironmentStateId
  }

  try {
    const data = await messageApi.create(payload, store.token)
    success.value = data && data[0] ? data[0] : 'Mensaje creado'
    form.code = ''
    form.title = ''
    form.content = ''
    emit('created')
  } catch (e) {
    formError.value = e.message
  }
}
</script>

<template>
  <section class="card">
    <h2>Crear mensaje</h2>

    <p v-if="!store.token" class="warn">
      No hay token. Ve a la pestaña "Crear token" y genera uno primero.
    </p>

    <div class="grid">
      <label>
        Aplicación
        <select v-model="form.applicationId" @change="onAppChange">
          <option value="">Seleccionar…</option>
          <option v-for="a in store.applications" :key="a.id" :value="a.id">{{ a.name }}</option>
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
        Funcionalidad
        <select v-model="form.functionalityId" :disabled="!functionalities.length">
          <option value="">Seleccionar…</option>
          <option v-for="f in functionalities" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </label>
    </div>

    <div class="grid">
      <label>
        Código
        <input v-model="form.code" placeholder="REL_TO_DOC_006" />
      </label>
      <label>
        Tipo
        <select v-model="form.typeId">
          <option v-for="t in store.types" :key="t.value" :value="t.value">{{ t.name }}</option>
        </select>
      </label>
      <label>
        Categoría
        <select v-model="form.categoryId">
          <option v-for="c in store.categories" :key="c.value" :value="c.value">{{ c.name }}</option>
        </select>
      </label>
      <label>
        Estado
        <select v-model="form.statusId">
          <option v-for="s in store.states" :key="s.value" :value="s.value">{{ s.name }}</option>
        </select>
      </label>
      <label>
        Estado de entorno
        <select v-model="form.messageEnvironmentStateId">
          <option v-for="s in store.envStates" :key="s.value" :value="s.value">{{ s.name }}</option>
        </select>
      </label>
      <label>
        Título (10 a 50 caracteres)
        <input v-model="form.title" />
      </label>
      <label class="full">
        Contenido (10 a 100 caracteres)
        <textarea v-model="form.content" rows="3"></textarea>
      </label>
    </div>

    <p v-if="formError" class="err">{{ formError }}</p>
    <p v-if="success" class="ok">{{ success }}</p>

    <button :disabled="!store.token" @click="createMessage">Crear mensaje</button>
    <p v-if="!store.token" class="warn">Genera un token antes de crear.</p>
  </section>
</template>