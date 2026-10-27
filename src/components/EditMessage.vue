<script setup>
import { ref, reactive, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { catalogApi, messageApi } from '../api'
import { store } from '../store'
import { validateMessageFields } from '../messageForm'
import PageHeader from './ui/PageHeader.vue'
import AppIcon from './ui/AppIcon.vue'

const props = defineProps({
  message: { type: Object, required: true }
})
const emit = defineEmits(['updated', 'cancel'])

const functionalities = ref([])
const success = ref('')
const formError = ref('')
const saving = ref(false)
let returnTimer
onBeforeUnmount(() => clearTimeout(returnTimer))

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
    form.statusId = msg.statusId || matchState?.value || (store.states[0]?.value ?? '')
    form.functionalityId = msg.functionalityId || ''
  },
  { immediate: true }
)

async function loadFunctionalities() {
  functionalities.value = []
  const appId = store.activeContext?.applicationId || store.activeContext?.application?.id
  if (!appId) return
  try {
    const list = await catalogApi.functionalities(appId)
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
  if (saving.value || success.value) return
  success.value = ''
  formError.value = validateMessageFields(form)
  if (formError.value) return

  const payload = {
    title: form.title,
    content: form.content,
    typeId: form.typeId,
    categoryId: form.categoryId,
    statusId: form.statusId,
    functionalityId: form.functionalityId
  }

  saving.value = true
  try {
    await messageApi.update(props.message.code, payload)
    success.value = 'Mensaje actualizado exitosamente'
    emit('updated')
    returnTimer = setTimeout(() => emit('cancel'), 800)
  } catch (e) {
    store.handleUnauthorized(e)
    formError.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="card">
    <PageHeader title="Editar mensaje" :description="`Actualiza el contenido y la clasificación de ${message.code}.`" />
    <form @submit.prevent="updateMessage">
    <fieldset :disabled="saving || !!success">
    <div class="grid">
      <label>
        Tipo *
        <select v-model="form.typeId" required>
          <option v-for="t in store.types" :key="t.value" :value="t.value">{{ t.name }}</option>
        </select>
      </label>
      <label>
        Categoría *
        <select v-model="form.categoryId" required>
          <option v-for="c in store.categories" :key="c.value" :value="c.value">{{ c.name }}</option>
        </select>
      </label>
      <label>
        Estado *
        <select v-model="form.statusId" required>
          <option v-for="s in store.states" :key="s.value" :value="s.value">{{ s.name }}</option>
        </select>
      </label>
      <label>
        Funcionalidad *
        <select v-model="form.functionalityId" required :disabled="!functionalities.length">
          <option value="">Seleccionar…</option>
          <option v-for="f in functionalities" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </label>
    </div>

    <div class="form-grid two">
      <label>
        Título * (10 a 50)
        <input v-model="form.title" required minlength="10" maxlength="50" placeholder="Credenciales incorrectas" />
        <small>{{ titleCount }}/50 caracteres</small>
      </label>
      <label>
        Contenido * (10 a 100)
        <textarea v-model="form.content" required minlength="10" maxlength="100" rows="3"></textarea>
        <small>{{ contentCount }}/100 caracteres</small>
      </label>
    </div>

    </fieldset>
    <p v-if="formError" class="alert error" role="alert">{{ formError }}</p>
    <p v-if="success" class="alert success" role="status">{{ success }}</p>

    <div class="form-actions">
      <button type="button" class="secondary" :disabled="saving" @click="emit('cancel')">Cancelar</button>
      <button type="submit" :disabled="saving || !!success"><AppIcon name="check" :size="16" />{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
    </div>
    </form>
  </section>
</template>
