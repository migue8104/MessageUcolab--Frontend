<script setup>
import { ref } from 'vue'
import { messageApi, toMessageCode } from '../api'
import { store } from '../store'

const code = ref('')
const targetLanguage = ref('en')
const result = ref(null)
const error = ref('')
const loading = ref(false)
const translationForbidden = ref(false)

const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' }
]

async function translate() {
  error.value = ''
  result.value = null
  loading.value = true
  try {
    const data = await messageApi.translate(toMessageCode(code.value), targetLanguage.value, store.token)
    result.value = Array.isArray(data) ? data[0] || null : data
  } catch (e) {
    store.handleUnauthorized(e)
    translationForbidden.value = e.code === 'FORBIDDEN'
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="card">
    <h2>Traducir mensaje</h2>

    <p v-if="!store.token" class="warn">
      No hay token. Ve a la pestaña "Crear token" y genera uno primero.
    </p>

    <template v-else>
      <div class="grid">
        <label>
          Código del mensaje
          <input v-model="code" placeholder="MSG_WELCOME" @keyup.enter="translate" />
        </label>
        <label>
          Idioma destino
          <select v-model="targetLanguage">
            <option v-for="l in languages" :key="l.code" :value="l.code">{{ l.name }}</option>
          </select>
        </label>
      </div>

      <button :disabled="!code.trim() || loading || translationForbidden" @click="translate">
        {{ loading ? 'Traduciendo…' : 'Traducir' }}
      </button>

      <p v-if="error" class="err">{{ error }}</p>

      <div v-if="result" class="translation">
        <h3>Original</h3>
        <table class="detail">
          <tbody>
            <tr><th>Código</th><td>{{ result.code }}</td></tr>
            <tr><th>Título</th><td>{{ result.originalTitle }}</td></tr>
            <tr><th>Contenido</th><td>{{ result.originalContent }}</td></tr>
            <tr><th>Tipo</th><td>{{ result.type }}</td></tr>
            <tr><th>Categoría</th><td>{{ result.category }}</td></tr>
            <tr><th>Funcionalidad</th><td>{{ result.functionality }}</td></tr>
          </tbody>
        </table>

        <h3>Traducción ({{ languages.find(l => l.code === result.targetLanguage)?.name || result.targetLanguage }})</h3>
        <table class="detail">
          <tbody>
            <tr><th>Título</th><td>{{ result.translatedTitle }}</td></tr>
            <tr><th>Contenido</th><td>{{ result.translatedContent }}</td></tr>
          </tbody>
        </table>

        <p class="info">
          Traducción realizada por <strong>{{ result.translationProvider }}</strong>
          con modelo <strong>{{ result.translationModel }}</strong>
          en {{ result.translationElapsedMs }} ms.
        </p>
      </div>
    </template>
  </section>
</template>