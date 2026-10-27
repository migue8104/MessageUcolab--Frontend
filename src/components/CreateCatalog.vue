<script setup>
import { ref, computed, watch } from 'vue'
import { catalogApi } from '../api'
import { store } from '../store'
import { statusName } from '../presentation'
import FunctionalityModal from './FunctionalityModal.vue'
import PageHeader from './ui/PageHeader.vue'
import AppIcon from './ui/AppIcon.vue'
import EmptyState from './ui/EmptyState.vue'
import StatusBadge from './ui/StatusBadge.vue'

const emit = defineEmits(['created'])
const tab = ref('functionalities')
const search = ref('')
const state = ref('')
const applicationId = ref(store.activeContext?.applicationId || '')
const functionalities = ref([])
const loading = ref(false)
const error = ref('')
const success = ref('')
const showModal = ref(false)
const page = ref(1)
const pageSize = 10
const tabs = [{ value: 'functionalities', label: 'Funcionalidades' }, { value: 'categories', label: 'Categorías' }, { value: 'types', label: 'Tipos' }]
const applicationName = computed(() => store.applications.find((item) => item.id === applicationId.value)?.name || store.activeContext?.applicationName || '')
const stateOptions = computed(() => [...new Set(functionalities.value.map(statusName).filter(Boolean))])
const hasStates = computed(() => stateOptions.value.length > 0)
const filtered = computed(() => functionalities.value.filter((item) => item.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()) && (!state.value || statusName(item) === state.value)))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const readonlyCatalog = computed(() => tab.value === 'categories' ? store.categories : store.types)
function moveTab(offset) {
  const index = tabs.findIndex((item) => item.value === tab.value)
  tab.value = tabs[(index + offset + tabs.length) % tabs.length].value
  document.getElementById(`tab-${tab.value}`)?.focus()
}
let loadVersion = 0
async function load() {
  const version = ++loadVersion
  functionalities.value = []
  loading.value = true
  error.value = ''
  state.value = ''
  try {
    const list = applicationId.value ? await catalogApi.functionalities(applicationId.value) : []
    if (version === loadVersion) functionalities.value = list
  } catch (e) {
    store.handleUnauthorized(e)
    if (version === loadVersion) error.value = e.message
  } finally {
    if (version === loadVersion) loading.value = false
  }
}
watch(applicationId, load, { immediate: true })
watch([search, state, applicationId], () => { page.value = 1 })
function created({ functionalities: list }) {
  functionalities.value = list
  showModal.value = false
  success.value = 'Funcionalidad creada correctamente.'
  search.value = ''
  state.value = ''
  emit('created', 'functionality')
}
</script>

<template>
  <div>
    <div class="catalog-tabs" role="tablist" aria-label="Catálogos"><button v-for="item in tabs" :id="`tab-${item.value}`" :key="item.value" role="tab" :aria-selected="tab === item.value" :tabindex="tab === item.value ? 0 : -1" aria-controls="catalog-panel" :class="{ active: tab === item.value }" @keydown.right.prevent="moveTab(1)" @keydown.left.prevent="moveTab(-1)" @click="tab = item.value">{{ item.label }}</button></div>
    <section id="catalog-panel" class="card" role="tabpanel" :aria-labelledby="`tab-${tab}`">
      <template v-if="tab === 'functionalities'">
        <PageHeader title="Funcionalidades" description="Administra las funcionalidades de tu aplicación."><button :disabled="!applicationId || loading" @click="success = ''; showModal = true"><AppIcon name="plus" :size="16" />Crear funcionalidad</button></PageHeader>
        <div class="filter-grid catalog-filters"><label>Aplicación<select v-model="applicationId"><option v-for="app in store.applications" :key="app.id" :value="app.id">{{ app.name }}</option></select></label><label>Estado<select v-model="state" :disabled="!hasStates" :title="!hasStates ? 'El catálogo actual no devuelve estados' : ''"><option value="">Todos</option><option v-for="item in stateOptions" :key="item" :value="item">{{ item }}</option></select></label><label>Buscar funcionalidad<div class="search-control"><input v-model="search" placeholder="Buscar por nombre…" /><AppIcon name="search" :size="16" /></div></label></div>
        <p v-if="loading" class="loading-state" role="status">Cargando funcionalidades…</p><p v-if="error" class="alert error" role="alert">{{ error }} <button class="link" @click="load">Reintentar</button></p><p v-if="success" class="alert success" role="status">{{ success }}</p>
        <div v-if="visible.length" class="table-scroll"><table><thead><tr><th>Nombre</th><th>Estado</th></tr></thead><tbody><tr v-for="item in visible" :key="item.id"><td class="strong">{{ item.name }}</td><td><StatusBadge :status="statusName(item)" /></td></tr></tbody></table></div>
        <EmptyState v-else-if="!loading && !error" icon="settings" :title="search || state ? 'Sin coincidencias' : 'Sin funcionalidades'" description="Crea funcionalidades para organizar tus mensajes."><button @click="showModal = true"><AppIcon name="plus" :size="16" />Crear funcionalidad</button></EmptyState>
        <p class="data-note">Incluye funcionalidades activas e inactivas. Solo las activas se pueden seleccionar al crear mensajes. El catálogo permite consultar y crear, sin operaciones de edición o eliminación ni conteos de mensajes.</p>
        <footer v-if="filtered.length" class="pagination"><span>{{ filtered.length }} funcionalidades</span><div class="pagination-controls"><button class="secondary icon-button" aria-label="Página anterior" :disabled="page <= 1" @click="page--"><AppIcon name="back" :size="16" /></button><span class="current-page">{{ page }}</span><button class="secondary icon-button" aria-label="Página siguiente" :disabled="page >= pageCount" @click="page++"><AppIcon name="arrow" :size="16" /></button></div></footer>
      </template>
      <template v-else><PageHeader :title="tab === 'categories' ? 'Categorías' : 'Tipos'" description="Catálogo disponible para clasificar tus mensajes." /><p v-if="store.catalogsError" class="alert error" role="alert">{{ store.catalogsError }}</p><div v-if="readonlyCatalog.length" class="table-scroll"><table><thead><tr><th>Nombre</th><th>Disponibilidad</th></tr></thead><tbody><tr v-for="item in readonlyCatalog" :key="item.value"><td class="strong">{{ item.name }}</td><td><span class="subtle-badge">Solo lectura</span></td></tr></tbody></table></div><EmptyState v-else title="Catálogo sin datos" /><p class="data-note">Estos valores son administrados por el backend. No hay operaciones de creación, edición o eliminación expuestas.</p></template>
    </section>
    <FunctionalityModal v-if="showModal" :application-id="applicationId" :application-name="applicationName" @close="showModal = false" @created="created" />
  </div>
</template>
