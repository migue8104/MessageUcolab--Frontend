<script setup>
import { ref, watch } from 'vue'
import { messageApi, toMessageCode } from '../api'
import { store } from '../store'
import { statusName, formatDate } from '../presentation'
import PageHeader from './ui/PageHeader.vue'
import AppIcon from './ui/AppIcon.vue'
import EmptyState from './ui/EmptyState.vue'
import StatusBadge from './ui/StatusBadge.vue'
import EnvironmentBadge from './ui/EnvironmentBadge.vue'

const props = defineProps({ code: { type: String, default: '' } })
const emit = defineEmits(['edit'])
const inputCode = ref('')
const result = ref(null)
const error = ref('')
const loading = ref(false)
const searched = ref(false)

async function load() {
  if (loading.value) return
  error.value = ''
  result.value = null
  const value = toMessageCode(inputCode.value)
  if (!store.isAuthenticated || !value) return
  loading.value = true
  searched.value = true
  try {
    const data = await messageApi.byCode(value)
    result.value = Array.isArray(data) ? data[0] || null : data
  } catch (e) {
    store.handleUnauthorized(e)
    error.value = e.message
  } finally {
    loading.value = false
  }
}

watch(() => props.code, (value) => {
  if (value) {
    inputCode.value = value
    load()
  }
}, { immediate: true })
</script>

<template>
  <section class="card">
    <PageHeader title="Consultar mensaje por código" description="Busca y visualiza la información completa de un mensaje." />
    <form class="lookup-bar" @submit.prevent="load">
      <label class="sr-only" for="lookup-code">Código del mensaje</label>
      <input id="lookup-code" v-model="inputCode" placeholder="Código del mensaje (ej. MSG_WELCOME)" />
      <button type="submit" :disabled="!inputCode.trim() || loading">
        <AppIcon name="search" :size="16" />{{ loading ? 'Consultando…' : 'Consultar' }}
      </button>
    </form>
    <p v-if="error" class="alert error" role="alert">{{ error }}</p>
    <article v-if="result" class="message-detail">
      <header class="detail-heading">
        <div><strong>{{ result.code }}</strong><StatusBadge :status="statusName(result)" /></div>
        <button type="button" class="soft" @click="emit('edit', result)"><AppIcon name="edit" :size="16" />Editar</button>
      </header>
      <div class="detail-columns">
        <dl class="detail-list">
          <div><dt>Título</dt><dd>{{ result.title }}</dd></div>
          <div><dt>Organización</dt><dd>{{ store.activeContext?.organizationName }}</dd></div>
          <div><dt>Aplicación</dt><dd>{{ store.activeContext?.applicationName }}</dd></div>
          <div><dt>Funcionalidad</dt><dd>{{ result.functionality }}</dd></div>
          <div><dt>Tipo</dt><dd>{{ result.type }}</dd></div>
          <div><dt>Categoría</dt><dd>{{ result.category }}</dd></div>
        </dl>
        <dl class="detail-list">
          <div>
            <dt>Ambientes</dt>
            <dd class="badge-list">
              <EnvironmentBadge v-for="env in result.environments || []" :key="env.id" :name="env.name" />
              <span v-if="!result.environments?.length">—</span>
            </dd>
          </div>
          <div><dt>Estado</dt><dd><StatusBadge :status="statusName(result)" /></dd></div>
          <div class="stacked"><dt>Contenido</dt><dd class="message-content">{{ result.content }}</dd></div>
          <div class="stacked"><dt>Última modificación</dt><dd>{{ formatDate(result.updatedAt) }}</dd></div>
          <div v-if="result.createdAt" class="stacked"><dt>Fecha de creación</dt><dd>{{ formatDate(result.createdAt) }}</dd></div>
        </dl>
      </div>
    </article>
    <EmptyState v-else-if="!loading && !error" icon="search" :title="searched ? 'No encontramos ese código' : 'Encuentra el mensaje que necesitas'" :description="searched ? 'Verifica el código y la aplicación seleccionada.' : 'Ingresa un código para consultar sus datos y ambientes.'" />
  </section>
</template>
