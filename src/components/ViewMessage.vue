<script setup>
import { ref, watch } from 'vue'
import { messageApi, toMessageCode } from '../api'
import { store } from '../store'

const props = defineProps({ code: { type: String, default: '' } })

const inputCode = ref('')
const result = ref(null)
const error = ref('')

// Modal de traducción
const showTranslate = ref(false)
// Códigos ISO para el proveedor de traducción (no UUIDs de language_base)
const languages = [
  { value: 'en', name: 'English' },
  { value: 'es', name: 'Spanish' },
  { value: 'fr', name: 'French' }
]
const targetLanguage = ref('')
const translating = ref(false)
const translation = ref(null)
const translateError = ref('')
const translationForbidden = ref(false)

async function load() {
  error.value = ''
  result.value = null
  const value = toMessageCode(inputCode.value)
  if (!store.token || !value) return
  try {
    const data = await messageApi.byCode(value, store.token)
    result.value = Array.isArray(data) ? data[0] || null : data
  } catch (e) {
    store.handleUnauthorized(e)
    error.value = e.message
  }
}

function openTranslate() {
  translation.value = null
  translateError.value = ''
  targetLanguage.value = languages.find((l) => l.value !== 'en')?.value || 'es'
  showTranslate.value = true
}

async function doTranslate() {
  if (!result.value || !targetLanguage.value) return
  translating.value = true
  translateError.value = ''
  try {
    const data = await messageApi.translate(result.value.code, targetLanguage.value, store.token)
    translation.value = Array.isArray(data) ? data[0] || null : data
  } catch (e) {
    store.handleUnauthorized(e)
    translationForbidden.value = e.code === 'FORBIDDEN'
    translateError.value = e.message
  } finally {
    translating.value = false
  }
}

watch(
  () => props.code,
  (value) => {
    if (value) {
      inputCode.value = value
      load()
    }
  },
  { immediate: true }
)
</script>

<template>
  <section class="card">
    <h2>Consultar mensaje por código</h2>

    <div class="toolbar">
      <input
        v-model="inputCode"
        placeholder="Código del mensaje (ej. MSG_WELCOME)"
        @keyup.enter="load"
      />
      <button :disabled="!inputCode.trim()" @click="load">Consultar</button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>

    <table v-if="result" class="detail">
      <tbody>
        <tr>
          <th>Código</th>
          <td>{{ result.code }}</td>
        </tr>
        <tr>
          <th>Título</th>
          <td>{{ result.title }}</td>
        </tr>
        <tr>
          <th>Contenido</th>
          <td>{{ result.content }}</td>
        </tr>
        <tr>
          <th>Tipo</th>
          <td>{{ result.type }}</td>
        </tr>
        <tr>
          <th>Categoría</th>
          <td>{{ result.category }}</td>
        </tr>
        <tr>
          <th>Funcionalidad</th>
          <td>{{ result.functionality }}</td>
        </tr>
      </tbody>
    </table>

    <div v-if="result" class="toolbar">
      <button @click="openTranslate">Traducir</button>
    </div>

    <div v-if="showTranslate" class="modal-backdrop" @click.self="showTranslate = false">
      <section class="modal">
        <h2>Traducir {{ result.code }}</h2>

        <label>
          Idioma destino
          <select v-model="targetLanguage">
            <option v-for="l in languages" :key="l.value" :value="l.value">{{ l.name }}</option>
          </select>
        </label>

        <p v-if="translateError" class="err">{{ translateError }}</p>

        <div v-if="translating" class="info">Traduciendo…</div>

        <div v-if="translation" class="trans-block">
          <div>
            <h4>Original</h4>
            <p>{{ translation.originalTitle || result.title }}</p>
            <p>{{ translation.originalContent || result.content }}</p>
          </div>
          <div>
            <h4>Traducción ({{ translation.translationLanguage || targetLanguage }})</h4>
            <p>{{ translation.translatedTitle }}</p>
            <p>{{ translation.translatedContent }}</p>
            <small v-if="translation.translationProvider">
              {{ translation.translationProvider }} · {{ translation.translationModel }}
            </small>
          </div>
        </div>

        <div class="toolbar">
          <button class="ghost" @click="showTranslate = false">Cerrar</button>
          <button :disabled="translating || !targetLanguage || translationForbidden" @click="doTranslate">
            {{ translating ? 'Traduciendo…' : 'Traducir' }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 20;
}

.modal {
  width: 100%;
  max-width: 620px;
  max-height: 85vh;
  overflow: auto;
  background: #fff;
  border-radius: 10px;
  padding: 18px 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.trans-block {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 12px 0;
}

.trans-block > div {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  background: #f9fafb;
}

button.ghost {
  background: #f3f4f6;
  color: #374151;
}
</style>