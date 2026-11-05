<script setup>
import { ref, computed, watch } from 'vue'
import { catalogApi, toMessageCode } from '../api'
import { useMessageSelection } from '../messageSelection'
import { store } from '../store'
import { statusName, formatDate, environmentTone } from '../presentation'
import PageHeader from './ui/PageHeader.vue'
import EmptyState from './ui/EmptyState.vue'
import AppIcon from './ui/AppIcon.vue'
import EnvironmentBadge from './ui/EnvironmentBadge.vue'
import StatusBadge from './ui/StatusBadge.vue'
import AppModal from './ui/AppModal.vue'

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

const {
  selectedCodes, selectedCount, allOnPage, someOnPage, busy, disabled: selectionDisabled,
  selecting, deleting, pendingDelete, deleteProgress, error: deleteError, notice: deleteNotice,
  clearSelection, toggleMessage, togglePage, selectAllResults,
  requestDelete, closeDelete, deleteMessages,
  pendingEnvironmentEdit, environmentIds, allEditEnvironments, updatingEnvironments, environmentProgress,
  requestEnvironmentEdit, closeEnvironmentEdit, updateSelectedEnvironments
} = useMessageSelection()

const search = ref(store.messageSearch)
const titleSearch = ref(store.messageTitleSearch)
const updatedAtSort = computed(() => store.messagesSortColumn === 'updatedAt'
  ? (store.messagesSortDirection === 'ASC' ? 'ascending' : 'descending')
  : 'none')
const sortAction = computed(() => updatedAtSort.value === 'descending'
  ? 'Ordenar del más antiguo al más reciente'
  : 'Ordenar del más reciente al más antiguo')

watch(() => store.messageSearch, (value) => { search.value = value })
watch(() => store.messageTitleSearch, (value) => { titleSearch.value = value })

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
  titleSearch.value = ''
  await store.setMessageFilters({ code: '', title: '', statusId: '', functionalityId: '', environmentIds: [] })
}

// Vacío = todos los ambientes de la aplicación.
const selectedEnvironments = computed({
  get: () => store.environmentFilter,
  set: (ids) => store.setEnvironmentFilter(ids)
})

async function searchMessages() {
  if (store.messagesLoading || busy.value) return
  await store.setMessageFilters({ code: toMessageCode(search.value), title: titleSearch.value.trim() })
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
    <PageHeader title="Mensajes" description="Consulta, filtra y gestiona todos los mensajes registrados."><button :disabled="busy" @click="emit('create')"><AppIcon name="plus" :size="17" />Crear mensaje</button></PageHeader>
    <form class="message-searches" role="search" aria-label="Buscar mensajes" @submit.prevent="searchMessages">
      <div class="search-bar">
        <label class="sr-only" for="message-search">Buscar por código</label>
        <input
          id="message-search"
          v-model="search"
          :disabled="busy"
          type="search"
          placeholder="Buscar por código (ej. MSG_BIENVENIDA)…"
        />
        <button type="submit" class="search-submit" aria-label="Buscar por código" :disabled="store.messagesLoading || busy"><AppIcon name="search" :size="18" /></button>
      </div>
      <div class="search-bar">
        <label class="sr-only" for="message-title-search">Buscar por título</label>
        <input
          id="message-title-search"
          v-model="titleSearch"
          :disabled="busy"
          type="search"
          placeholder="Buscar por título…"
        />
        <button type="submit" class="search-submit" aria-label="Buscar por título" :disabled="store.messagesLoading || busy"><AppIcon name="search" :size="18" /></button>
      </div>
    </form>
    <div class="filter-grid message-filters">
      <label>Organización<input :value="store.activeContext?.organizationName" readonly /></label>
      <label>Aplicación<input :value="store.activeContext?.applicationName" readonly /></label>
      <div class="field"><span id="environment-filter-label">Ambientes</span><details class="filter-dropdown"><summary aria-labelledby="environment-filter-label">{{ store.environmentFilter.length ? `${store.environmentFilter.length} seleccionados` : 'Todos' }}<AppIcon name="down" :size="14" /></summary><div class="filter-options"><label><input type="checkbox" :checked="!store.environmentFilter.length" :disabled="busy" @change="store.setEnvironmentFilter([])" />Todos</label><label v-for="env in store.environments" :key="env.id"><input v-model="selectedEnvironments" type="checkbox" :value="env.id" :disabled="busy" />{{ env.name }}</label></div></details></div>
      <label>Estado
        <select v-model="state" :disabled="busy || store.catalogsLoading || !store.states.length">
          <option value="">Todos</option>
          <option v-for="item in store.states" :key="item.value" :value="item.value">{{ item.name }}</option>
        </select>
      </label>
      <label>Funcionalidad
        <select v-model="functionality" :disabled="busy || functionalitiesLoading || !!functionalitiesError">
          <option value="">{{ functionalitiesLoading ? 'Cargando…' : 'Todas' }}</option>
          <option v-for="item in functionalities" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </label>
      <button class="soft clear-filters" :disabled="store.messagesLoading || busy" @click="clearFilters"><AppIcon name="reset" :size="16" />Limpiar filtros</button>
    </div>

    <p v-if="store.messagesLoading" class="loading-state" role="status">Cargando mensajes…</p>
    <p v-if="functionalitiesError || store.catalogsError" class="alert error" role="alert">{{ functionalitiesError || store.catalogsError }}</p>
    <p v-if="store.messagesError" class="alert error" role="alert">{{ store.messagesError }}</p>

    <div v-if="store.messages.length" class="table-scroll"><table>
      <thead>
        <tr>
          <th scope="col" class="message-check-cell"><input type="checkbox" aria-label="Seleccionar todos los mensajes de esta página" :checked="allOnPage" :indeterminate="someOnPage" :disabled="selectionDisabled" @change="togglePage($event.target.checked)" /></th>
          <th>Código</th>
          <th>Título</th>
          <th>Funcionalidad</th>
          <th>Ambientes</th>
          <th>Estado</th>
          <th scope="col" :aria-sort="updatedAtSort">
            <button type="button" class="table-sort" :title="sortAction" :aria-label="`Última modificación: ${sortAction}`" :disabled="store.messagesLoading || busy" @click="store.toggleMessagesUpdatedAtSort">
              Última modificación
              <AppIcon :name="updatedAtSort === 'none' ? 'sort' : (updatedAtSort === 'ascending' ? 'up' : 'down')" :size="14" />
            </button>
          </th>
          <th class="align-right">Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in store.messages" :key="m.code" :class="{ 'message-row-selected': selectedCodes.has(m.code) }">
          <td class="message-check-cell"><input type="checkbox" :aria-label="`Seleccionar ${m.code}`" :checked="selectedCodes.has(m.code)" :disabled="selectionDisabled" @change="toggleMessage(m.code, $event.target.checked)" /></td>
          <td><button class="link message-code" :disabled="busy" @click="emit('view', m.code)">{{ m.code }}</button></td>
          <td>{{ m.title }}</td>
          <td>{{ m.functionality }}</td>
          <td>
            <span class="badge-list"><EnvironmentBadge v-for="env in m.environments || []" :key="env.id" :name="env.name" /></span>
          </td>
          <td><StatusBadge :status="statusName(m)" /></td>
          <td class="date-cell">{{ formatDate(m.updatedAt) }}</td>
          <td class="align-right">
            <button type="button" class="link danger" :aria-label="`Eliminar ${m.code}`" :disabled="selectionDisabled" @click="requestDelete([m.code])">
              <AppIcon name="trash" :size="15" />Eliminar
            </button>
          </td>
        </tr>
      </tbody>
    </table></div>
    <p v-if="deleteError" class="alert error" role="alert">{{ deleteError }}</p>
    <EmptyState v-if="!store.messagesLoading && !store.messagesError && !store.messages.length" :title="store.messageSearch || store.messageTitleSearch || store.environmentFilter.length || state || functionality ? 'No encontramos mensajes' : 'Tu primer mensaje está por llegar'" description="Crea un mensaje o ajusta los filtros para ver otros resultados."><button :disabled="busy" @click="emit('create')"><AppIcon name="plus" :size="16" />Crear mensaje</button></EmptyState>

    <div v-if="store.totalMessages > 0 || store.messages.length > 0 || selectedCount" class="pagination message-list-footer">
      <div class="message-footer-summary">
        <span>{{ store.totalMessages || store.messages.length }} resultados</span>
        <span class="message-selection-count" role="status">{{ selecting ? 'Seleccionando…' : `${selectedCount} seleccionados` }}</span>
      </div>
      <div class="message-selection-controls" role="group" aria-label="Selección de mensajes">
        <label class="message-select-page" title="Seleccionar todos los mensajes de esta página"><input type="checkbox" aria-label="Seleccionar todos los mensajes de esta página" :checked="allOnPage" :indeterminate="someOnPage" :disabled="selectionDisabled || !store.messages.length" @change="togglePage($event.target.checked)" />Seleccionar todo</label>
        <button v-if="store.totalMessages > store.messages.length && selectedCount < store.totalMessages" type="button" class="link" :disabled="selectionDisabled" @click="selectAllResults">Todos los resultados ({{ store.totalMessages }})</button>
        <button v-if="selectedCount" type="button" class="link" :disabled="busy" @click="clearSelection">Quitar selección</button>
        <button v-if="selectedCount" type="button" class="link" :disabled="selectionDisabled" @click="requestEnvironmentEdit"><AppIcon name="edit" :size="15" />Editar ambientes</button>
        <button type="button" class="link danger" :disabled="selectionDisabled || !selectedCount" @click="requestDelete()"><AppIcon name="trash" :size="15" />Eliminar seleccionados<span v-if="selectedCount"> ({{ selectedCount }})</span></button>
      </div>
      <div class="pagination-controls">
      <label class="page-size">
        Por página:
        <select :value="store.messagesSize" :disabled="store.messagesLoading || busy" @change="store.changePageSize(Number($event.target.value))">
          <option v-for="s in [5, 10, 20, 50]" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <button class="secondary icon-button" aria-label="Página anterior" :disabled="store.messagesPage <= 1 || store.messagesLoading || busy" @click="prev"><AppIcon name="back" :size="16" /></button>
      <span class="page-info">
        Página {{ store.messagesPage }} de {{ effectiveTotalPages }}
        <template v-if="store.totalMessages > 0"> · {{ store.totalMessages }} mensajes</template>
      </span>
      <button class="secondary icon-button" aria-label="Página siguiente" :disabled="store.messagesPage >= effectiveTotalPages || store.messagesLoading || busy" @click="next"><AppIcon name="arrow" :size="16" /></button>
      </div>
    </div>
    <p v-if="deleteNotice" class="message-selection-notice" role="status">{{ deleteNotice }}</p>
    <AppModal v-if="pendingDelete" :title="pendingDelete.codes.length === 1 ? 'Eliminar mensaje' : 'Eliminar mensajes seleccionados'" :busy="deleting" @close="closeDelete">
      <p>Vas a eliminar <strong>{{ pendingDelete.codes.length }} {{ pendingDelete.codes.length === 1 ? 'mensaje' : 'mensajes' }}</strong> de la aplicación <strong>{{ pendingDelete.applicationName }}</strong>.</p>
      <p class="alert error">Se eliminarán de todos sus ambientes. Esta acción no se puede deshacer.</p>
      <ul class="message-delete-codes"><li v-for="code in pendingDelete.codes" :key="code">{{ code }}</li></ul>
      <p v-if="deleting" role="status">Procesados {{ deleteProgress }} de {{ pendingDelete.codes.length }} mensajes…</p>
      <div class="form-actions"><button type="button" class="secondary" :disabled="deleting" @click="closeDelete">Cancelar</button><button type="button" class="secondary danger" :disabled="deleting" @click="deleteMessages"><AppIcon name="trash" :size="16" />{{ deleting ? 'Eliminando…' : `Eliminar ${pendingDelete.codes.length === 1 ? 'mensaje' : pendingDelete.codes.length + ' mensajes'}` }}</button></div>
    </AppModal>
    <AppModal v-if="pendingEnvironmentEdit" title="Editar ambientes" :description="`${pendingEnvironmentEdit.codes.length} mensajes seleccionados · ${pendingEnvironmentEdit.applicationName}`" :busy="updatingEnvironments" @close="closeEnvironmentEdit">
      <form @submit.prevent="updateSelectedEnvironments">
        <fieldset :disabled="updatingEnvironments">
          <p class="bulk-environment-description">Elige los ambientes que tendrán todos los mensajes seleccionados. Solo se modifican sus ambientes; el contenido y la clasificación se conservan.</p>
          <div class="environment-options bulk-environment-options" role="group" aria-label="Nuevos ambientes de los mensajes" aria-describedby="bulk-environment-help">
            <label class="environment-option environment-theme all" :class="{ selected: allEditEnvironments }">
              <span class="environment-option-copy"><span class="environment-option-name"><AppIcon name="grid" :size="15" />Todos</span><small>Incluir todos los ambientes</small></span>
              <input v-model="allEditEnvironments" type="checkbox" :indeterminate.prop="environmentIds.length > 0 && !allEditEnvironments" :disabled="!pendingEnvironmentEdit.environments.length" />
            </label>
            <label v-for="env in pendingEnvironmentEdit.environments" :key="env.id" class="environment-option environment-theme" :class="[environmentTone(env.name), { selected: environmentIds.includes(env.id) }]">
              <span class="environment-option-copy"><span class="environment-option-name"><span class="environment-dot" aria-hidden="true"></span>{{ env.name }}</span><small>{{ environmentIds.includes(env.id) ? 'Seleccionado' : 'Incluir ambiente' }}</small></span>
              <input v-model="environmentIds" type="checkbox" :value="env.id" />
            </label>
          </div>
          <p id="bulk-environment-help" class="bulk-environment-description">Al guardar, se reemplazarán los ambientes actuales de cada mensaje por los elegidos aquí. Debes seleccionar al menos uno.</p>
          <p v-if="!pendingEnvironmentEdit.environments.length" class="alert error">La aplicación no tiene ambientes disponibles.</p>
          <details class="bulk-environment-messages"><summary>Ver los {{ pendingEnvironmentEdit.codes.length }} mensajes seleccionados</summary><ul class="message-delete-codes"><li v-for="code in pendingEnvironmentEdit.codes" :key="code">{{ code }}</li></ul></details>
        </fieldset>
        <p v-if="deleteError" class="alert error" role="alert">{{ deleteError }}</p>
        <p v-if="updatingEnvironments" role="status">Procesados {{ environmentProgress }} de {{ pendingEnvironmentEdit.codes.length }} mensajes…</p>
        <div class="form-actions"><button type="button" class="secondary" :disabled="updatingEnvironments" @click="closeEnvironmentEdit">Cancelar</button><button type="submit" :disabled="updatingEnvironments || !environmentIds.length"><AppIcon name="check" :size="16" />{{ updatingEnvironments ? 'Guardando…' : 'Aplicar ambientes' }}</button></div>
      </form>
    </AppModal>
  </section>
</template>

<style scoped>
.message-footer-summary, .message-selection-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.message-footer-summary > span, .message-selection-controls > :is(label, button) { white-space: nowrap; }
.message-list-footer .message-selection-controls { flex: 1; justify-content: center; }
.message-list-footer .message-selection-controls .link { font-size: 11px; }
.message-select-page { flex-direction: row; align-items: center; gap: 9px; cursor: pointer; }
.message-selection-count { color: var(--muted); }
.message-selection-notice { margin: 10px 0 0; color: var(--muted); font-size: 11px; }
.message-check-cell { width: 42px; text-align: center; }
.message-check-cell input { vertical-align: middle; cursor: pointer; }
.message-row-selected { background: #eef5ff; }
.message-delete-codes { max-height: 180px; overflow-y: auto; padding-left: 24px; font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.bulk-environment-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.bulk-environment-description { margin: 0 0 16px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.bulk-environment-options + .bulk-environment-description { margin-top: 14px; font-size: 11px; }
.bulk-environment-messages { color: var(--muted); font-size: 11px; }
.bulk-environment-messages > summary { cursor: pointer; }
@media (max-width: 760px) {
  .message-list-footer .message-selection-controls { flex-basis: 100%; justify-content: flex-start; }
}
</style>
