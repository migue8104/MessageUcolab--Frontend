<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { catalogApi, messageApi } from '../api'
import { store } from '../store'

const props = defineProps({
  message: { type: Object, required: true }
})
const emit = defineEmits(['updated', 'cancel'])

const functionalities = ref([])
const success = ref('')
const formError = ref('')

const form = reactive({
  title: '',
  content: '',
  typeId: '',
  categoryId: '',
  statusId: '',
  functionalityId: ''
})

const titleCount = computed(() => form.title.length)
const contentCount = computed(() => form.content.length)

watch(
  () => props.message,
  (msg) => {
    if (!msg) return
    form.title = msg.title || ''
    form.content = msg.content || ''
    const matchType = store.types.find((t) => t.name === msg.type)
    const matchCat = store.categories.find((c) => c.name === msg.category)
    const matchState = store.states.find((s) => s.name === msg.status)
    form.typeId = matchType?.value || (store.types[0]?.value ?? '')
    form.categoryId = matchCat?.value || (store.categories[0]?.value ?? '')
    form.statusId = matchState?.value || (store.states[0]?.value ?? '')
  },
  { immediate: true }
)

async function loadFunctionalities() {
  functionalities.value = []
  const appId = store.activeContext?.applicationId || store.activeContext?.application?.id
  if (!appId) return
  try {
    const list = await catalogApi.functionalities(appId, store.token)
    functionalities.value = list
    if (!form.functionalityId && list.length) {
      const matchFunc = list.find((f) => f.name === props.message?.functionality)
      form.functionalityId = matchFunc?.id || list[0].id
    }
  } catch (e) {
    store.handleUnauthorized(e)
    formError.value = e.message
  }
}

onMounted(loadFunctionalities)

async function updateMessage() {
  success.value = ''
  formError.value = ''

  const payload = {
    title: form.title,
    content: form.content,
    typeId: form.typeId,
    categoryId: form.categoryId,
    statusId: form.statusId,
    functionalityId: form.functionalityId
  }

  try {
    await messageApi.update(props.message.code, payload, store.token)
    success.value = 'Mensaje actualizado exitosamente'
    emit('updated')
    setTimeout(() => emit('cancel'), 800)
  } catch (e) {
    store.handleUnauthorized(e)
    formError.value = e.message
  }
}
</script>

<template>
  <section class="card">
    <h2>Editar mensaje — <code>{{ message.code }}</code></h2>

    <div class="grid">
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
      <label>
        Funcionalidad *
        <select v-model="form.functionalityId" :disabled="!functionalities.length">
          <option value="">Seleccionar…</option>
          <option v-for="f in functionalities" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </label>
    </div>

    <div class="grid">
      <label>
        Título * (10 a 50)
        <input v-model="form.title" placeholder="Credenciales incorrectas" />
        <small>{{ titleCount }}/50 caracteres</small>
      </label>
      <label class="full">
        Contenido * (10 a 100)
        <textarea v-model="form.content" rows="3"></textarea>
        <small>{{ contentCount }}/100 caracteres</small>
      </label>
    </div>

    <p v-if="formError" class="err">{{ formError }}</p>
    <p v-if="success" class="ok" style="font-weight:700">{{ success }}</p>

    <div class="toolbar">
      <button class="ghost" @click="emit('cancel')">Cancelar</button>
      <button @click="updateMessage">Guardar cambios</button>
    </div>
  </section>
</template>

<style scoped>
button.ghost {
  background: #f3f4f6;
  color: #374151;
}
code {
  font-size: 0.85em;
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
}
</style>
