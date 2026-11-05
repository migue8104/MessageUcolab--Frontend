<script setup>
import { ref, computed } from 'vue'
import { messageApi, toMessageCode } from '../api'
import { store } from '../store'
import { catalogLabel } from '../presentation'
import PageHeader from './ui/PageHeader.vue'
import EmptyState from './ui/EmptyState.vue'
import AppIcon from './ui/AppIcon.vue'

const code = ref('')
const targetLanguage = ref('en')
const original = ref(null)
const translations = ref([])
const error = ref('')
const loading = ref(false)
const searching = ref(false)
const searched = ref(false)
const translationForbidden = ref(false)
const languages = [
  { code: 'en', name: 'Inglés' }, { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Portugués' }, { code: 'fr', name: 'Francés' },
  { code: 'de', name: 'Alemán' }, { code: 'it', name: 'Italiano' }
]
const matchesOriginal = computed(() => original.value?.code === toMessageCode(code.value))
const languageName = (value) => languages.find((item) => item.code === value)?.name || value

async function search() {
  if (searching.value || loading.value || !code.value.trim()) return
  error.value = ''
  searching.value = true
  original.value = null
  translations.value = []
  searched.value = true
  try {
    const data = await messageApi.byCode(toMessageCode(code.value))
    const message = Array.isArray(data) ? data[0] || null : data
    original.value = message ? { ...message, type: catalogLabel(message.type), category: catalogLabel(message.category) } : null
  } catch (e) {
    store.handleUnauthorized(e)
    error.value = e.message
  } finally {
    searching.value = false
  }
}

async function translate() {
  if (loading.value || !matchesOriginal.value || translationForbidden.value) return
  error.value = ''
  loading.value = true
  try {
    const data = await messageApi.translate(original.value.code, targetLanguage.value)
    const result = Array.isArray(data) ? data[0] || null : data
    if (result) {
      const index = translations.value.findIndex((item) => item.targetLanguage === result.targetLanguage)
      if (index < 0) translations.value.push(result)
      else translations.value.splice(index, 1, result)
    }
  } catch (e) {
    store.handleUnauthorized(e)
    translationForbidden.value = e.status === 403 || e.code === 'FORBIDDEN'
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="card">
    <PageHeader title="Traducir mensaje" description="Consulta el mensaje original y genera traducciones con los servicios actuales." />
    <form class="translation-search" @submit.prevent="search"><label>Código del mensaje<div class="inline-field"><input v-model="code" required placeholder="Ej. MSG_BIENVENIDA" :disabled="loading || searching" /><button type="submit" :disabled="!code.trim() || searching || loading"><AppIcon name="search" :size="16" />{{ searching ? 'Buscando…' : 'Buscar' }}</button></div></label><label>Idioma destino<select v-model="targetLanguage" :disabled="loading"><option v-for="language in languages" :key="language.code" :value="language.code">{{ language.name }}</option></select></label></form>
    <p v-if="error" class="alert error" role="alert">{{ error }}</p>
    <div v-if="original" class="translation-columns">
      <section class="translation-pane"><header><h2>Mensaje original</h2><span class="subtle-badge"><AppIcon name="globe" :size="13" />{{ languageName(translations[0]?.sourceLanguage) || 'Idioma detectado al traducir' }}</span></header><strong class="message-code">{{ original.code }}</strong><div class="translation-content"><h3>{{ original.title }}</h3><p>{{ original.content }}</p></div><dl class="translation-metadata"><div><dt>Tipo</dt><dd>{{ original.type }}</dd></div><div><dt>Categoría</dt><dd>{{ original.category }}</dd></div><div><dt>Funcionalidad</dt><dd>{{ original.functionality }}</dd></div></dl></section>
      <section class="translation-pane"><header><h2>Traducciones</h2><button :disabled="!matchesOriginal || loading || translationForbidden" @click="translate"><AppIcon name="plus" :size="16" />{{ loading ? 'Traduciendo…' : 'Agregar traducción' }}</button></header><p v-if="!matchesOriginal" class="alert notice">Busca el nuevo código antes de traducir.</p><p v-if="loading" class="loading-state" role="status">Preparando la traducción…</p><article v-for="result in translations" :key="result.targetLanguage" class="translation-result"><header><strong>{{ languageName(result.targetLanguage) }}</strong><span class="subtle-badge">{{ result.dynamicTranslation ? 'Dinámica' : 'Traducción' }}</span></header><h3 v-if="result.translatedTitle">{{ result.translatedTitle }}</h3><p>{{ result.translatedContent }}</p><dl class="translation-metadata"><div v-if="result.translatedType"><dt>Tipo</dt><dd>{{ result.translatedType }}</dd></div><div v-if="result.translatedCategory"><dt>Categoría</dt><dd>{{ result.translatedCategory }}</dd></div><div v-if="result.translatedFunctionality"><dt>Funcionalidad</dt><dd>{{ result.translatedFunctionality }}</dd></div></dl><small v-if="result.translationProvider" class="info">{{ result.translationProvider }} · {{ result.translationModel }} · {{ result.translationElapsedMs }} ms</small></article><EmptyState v-if="!translations.length && !loading" icon="translate" title="Un mensaje, más idiomas" description="Selecciona el idioma destino y agrega una traducción." /><p class="data-note">Se muestran las traducciones generadas en esta consulta. El servicio actual no expone un listado persistido ni acciones de edición o eliminación.</p></section>
    </div>
    <EmptyState v-else-if="!searching && !error" icon="translate" :title="searched ? 'No encontramos ese mensaje' : 'Tus mensajes en otros idiomas'" description="Busca un código de la aplicación seleccionada para empezar." />
  </section>
</template>
