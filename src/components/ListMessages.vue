<script setup>
import { ref, computed, watch } from 'vue'
import { catalogApi, messageApi, toMessageCode } from '../api'
import { store } from '../store'
import { statusName, formatDate } from '../presentation'
import PageHeader from './ui/PageHeader.vue'
import EmptyState from './ui/EmptyState.vue'
import AppIcon from './ui/AppIcon.vue'
import EnvironmentBadge from './ui/EnvironmentBadge.vue'
import StatusBadge from './ui/StatusBadge.vue'

// Calcula las páginas totales combinando lo que dice el backend con lo que se puede inferir.
// Si la página actual está llena (tiene messagesSize ítems), hay al menos una página más.
const effectiveTotalPages = computed(() => {
  const fromBackend = store.totalPages || 0
  const fromCount = store.totalMessages > 0
    ? Math.ceil(store.totalMessages / store.messagesSize)
    : 0
  const base = Math.max(1, fromBackend, fromCount)
  return !fromBackend && !fromCount && store.messages.length >= store.messagesSize
    ? Math.max(base, store.messagesPage + 1)
    : base
})

const emit = defineEmits(['view', 'create'])

const deleteError = ref('')
const deleteLoading = ref('')

async function confirmDelete(message) {
  deleteError.value = ''
  if (!confirm(`¿Eliminar el mensaje "${message.code}"? Esta acción no se puede deshacer.`)) return
  deleteLoading.value = message.code
  try {
    await messageApi.remove(message.code)
    store.messages = store.messages.filter((m) => m.code !== message.code)
    // Decrementa pero nunca baja del conteo visible real
    store.totalMessages = Math.max(store.messages.length, store.totalMessages - 1)
  } catch (e) {
    store.handleUnauthorized(e)
    deleteError.value = e.message
  } finally {
    deleteLoading.value = ''
  }
}

const search = ref(store.messageSearch)
const functionalities = ref([])
const functionalitiesLoading = ref(false)
const functionalitiesError = ref('')
const state = computed({
  get: () => store.messageStatusFilter,
  set: (statusId) => store.setMessageFilters({ statusId })
})
const functionality = computed({
  get: () => store.functionalityFilter,
  set: (functionalityId) => store.setMessageFilters({ functionalityId })
})

watch(() => store.activeContext?.applicationId, async (applicationId, _previous, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  functionalities.value = []
  functionalitiesError.value = ''
  functionalitiesLoading.value = !!applicationId
  if (!applicationId) return
  try {
    const list = await catalogApi.functionalities(applicationId)
    if (current) functionalities.value = list
  } catch (e) {
    store.handleUnauthorized(e)
    if (current) functionalitiesError.value = e.message
  } finally {
    if (current) functionalitiesLoading.value = false
  }
}, { immediate: true })

async function clearFilters() {
  search.value = ''
  await store.setMessageFilters({ code: '', statusId: '', functionalityId: '', environmentIds: [] })
}

// Vacío = todos los ambientes de la aplicación.
const selectedEnvironments = computed({
  get: () => store.environmentFilter,
  set: (ids) => store.setEnvironmentFilter(ids)
})

async function searchCode() {
  if (store.messagesLoading) return
  await store.setMessageFilters({ code: toMessageCode(search.value) })
}

function next() {
  store.setMessagesPage(store.messagesPage + 1)
}

function prev() {
  store.setMessagesPage(store.messagesPage - 1)
}
</script>

<template>
  <section class="card">
    <PageHeader title="Mensajes" description="Consulta, filtra y gestiona todos los mensajes registrados."><button @click="emit('create')"><AppIcon name="plus" :size="17" />Crear mensaje</button></PageHeader>
    <form class="search-bar" @submit.prevent="searchCode">
      <label class="sr-only" for="message-search">Buscar por código</label>
      <input
        id="message-search"
        v-model="search"
        placeholder="Buscar por código (ej. MSG_WELCOME)…"
      />
      <button type="submit" class="search-submit" aria-label="Buscar mensaje" :disabled="store.messagesLoading"><AppIcon name="search" :size="18" /></button>
    </form>
    <div class="filter-grid message-filters">
      <label>Organización<input :value="store.activeContext?.organizationName" readonly /></label>
      <label>Aplicación<input :value="store.activeContext?.applicationName" readonly /></label>
      <div class="field"><span id="environment-filter-label">Ambientes</span><details class="filter-dropdown"><summary aria-labelledby="environment-filter-label">{{ store.environmentFilter.length ? `${store.environmentFilter.length} seleccionados` : 'Todos' }}<AppIcon name="down" :size="14" /></summary><div class="filter-options"><label><input type="checkbox" :checked="!store.environmentFilter.length" @change="store.setEnvironmentFilter([])" />Todos</label><label v-for="env in store.environments" :key="env.id"><input v-model="selectedEnvironments" type="checkbox" :value="env.id" />{{ env.name }}</label></div></details></div>
      <label>Estado
        <select v-model="state" :disabled="store.catalogsLoading || !store.states.length">
          <option value="">Todos</option>
          <option v-for="item in store.states" :key="item.value" :value="item.value">{{ item.name }}</option>
        </select>
      </label>
      <label>Funcionalidad
        <select v-model="functionality" :disabled="functionalitiesLoading || !!functionalitiesError">
          <option value="">{{ functionalitiesLoading ? 'Cargando…' : 'Todas' }}</option>
          <option v-for="item in functionalities" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </label>
      <button class="soft clear-filters" :disabled="store.messagesLoading" @click="clearFilters"><AppIcon name="reset" :size="16" />Limpiar filtros</button>
    </div>

    <p v-if="store.messagesLoading" class="loading-state" role="status">Cargando mensajes…</p>
    <p v-if="functionalitiesError || store.catalogsError" class="alert error" role="alert">{{ functionalitiesError || store.catalogsError }}</p>
    <p v-if="store.messagesError" class="alert error" role="alert">{{ store.messagesError }}</p>

    <div v-if="store.messages.length" class="table-scroll"><table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Título</th>
          <th>Funcionalidad</th>
          <th>Ambientes</th>
          <th>Estado</th>
          <th>Última modificación</th>
          <th class="align-right">Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in store.messages" :key="m.code">
          <td><button class="link message-code" @click="emit('view', m.code)">{{ m.code }}</button></td>
          <td>{{ m.title }}</td>
          <td>{{ m.functionality }}</td>
          <td>
            <span class="badge-list"><EnvironmentBadge v-for="env in m.environments || []" :key="env.id" :name="env.name" /></span>
          </td>
          <td><StatusBadge :status="statusName(m)" /></td>
          <td class="date-cell">{{ formatDate(m.updatedAt) }}</td>
          <td class="align-right">
            <button type="button" class="link danger" :aria-label="`Eliminar ${m.code}`" :disabled="deleteLoading === m.code" @click="confirmDelete(m)">
              <AppIcon name="trash" :size="15" />{{ deleteLoading === m.code ? 'Eliminando…' : 'Eliminar' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table></div>
    <p v-if="deleteError" class="alert error" role="alert">{{ deleteError }}</p>
    <EmptyState v-if="!store.messagesLoading && !store.messagesError && !store.messages.length" :title="store.messageSearch || store.environmentFilter.length || state || functionality ? 'No encontramos mensajes' : 'Tu primer mensaje está por llegar'" description="Crea un mensaje o ajusta los filtros para ver otros resultados."><button @click="emit('create')"><AppIcon name="plus" :size="16" />Crear mensaje</button></EmptyState>

    <div v-if="!store.messagesLoading && (store.totalMessages > 0 || store.messages.length > 0)" class="pagination">
      <span>{{ store.totalMessages || store.messages.length }} resultados</span>
      <div class="pagination-controls">
      <label class="page-size">
        Por página:
        <select :value="store.messagesSize" :disabled="store.messagesLoading" @change="store.changePageSize(Number($event.target.value))">
          <option v-for="s in [5, 10, 20, 50]" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <button class="secondary icon-button" aria-label="Página anterior" :disabled="store.messagesPage <= 1 || store.messagesLoading" @click="prev"><AppIcon name="back" :size="16" /></button>
      <span class="page-info">
        Página {{ store.messagesPage }} de {{ effectiveTotalPages }}
        <template v-if="store.totalMessages > 0"> · {{ store.totalMessages }} mensajes</template>
      </span>
      <button class="secondary icon-button" aria-label="Página siguiente" :disabled="store.messagesPage >= effectiveTotalPages || store.messagesLoading" @click="next"><AppIcon name="arrow" :size="16" /></button>
      </div>
    </div>
  </section>
</template>
