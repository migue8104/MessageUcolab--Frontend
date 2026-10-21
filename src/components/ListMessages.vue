<script setup>
import { ref, computed } from 'vue'
import { messageApi, toMessageCode } from '../api'
import { store } from '../store'

// Calcula las páginas totales combinando lo que dice el backend con lo que se puede inferir.
// Si la página actual está llena (tiene messagesSize ítems), hay al menos una página más.
const effectiveTotalPages = computed(() => {
  const fromBackend = store.totalPages || 0
  const fromCount = store.totalMessages > 0
    ? Math.ceil(store.totalMessages / store.messagesSize)
    : 0
  const base = Math.max(1, fromBackend, fromCount)
  return store.messages.length >= store.messagesSize
    ? Math.max(base, store.messagesPage + 1)
    : base
})

const emit = defineEmits(['view', 'create', 'edit'])

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

const search = ref('')

async function searchCode() {
  const code = toMessageCode(search.value)
  if (!code) {
    store.messageSearch = ''
    return store.loadMessages(false, 1)
  }
  store.messageSearch = code
  try {
    const data = await messageApi.byCode(code)
    store.messages = (Array.isArray(data) ? data : data && data.data ? data.data : []).slice(0, 1)
    store.totalMessages = store.messages.length
    store.totalPages = 1
    store.messagesPage = 1
  } catch (e) {
    store.handleUnauthorized(e)
    store.messagesError = e.message
    store.messages = []
  }
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
    <div class="toolbar">
      <h2>Mensajes</h2>
      <button @click="emit('create')">+ Crear mensaje</button>
    </div>

    <div class="toolbar">
      <input
        v-model="search"
        placeholder="Buscar por código (ej. MSG_WELCOME)…"
        @keyup.enter="searchCode"
      />
      <button :disabled="!search.trim() || store.messagesLoading" @click="searchCode">Buscar</button>
    </div>

    <p v-if="store.messagesLoading" class="info">Cargando mensajes… (la consulta puede tardar 2-3 s)</p>
    <p v-if="store.messagesError" class="err">{{ store.messagesError }}</p>

    <table v-if="store.messages.length">
      <thead>
        <tr>
          <th>Código</th>
          <th>Título</th>
          <th>Contenido</th>
          <th>Tipo</th>
          <th>Categoría</th>
          <th>Funcionalidad</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in store.messages" :key="m.code">
          <td>{{ m.code }}</td>
          <td>{{ m.title }}</td>
          <td>{{ m.content }}</td>
          <td>{{ m.type }}</td>
          <td>{{ m.category }}</td>
          <td>{{ m.functionality }}</td>
          <td class="actions-cell">
            <button class="icon-btn" title="Ver" @click="emit('view', m.code)">
              <i class="bi bi-eye"></i>
            </button>
            <button class="icon-btn edit" title="Editar" @click="emit('edit', m)">
              <i class="bi bi-pencil"></i>
            </button>
            <button
              class="icon-btn danger"
              title="Eliminar"
              :disabled="deleteLoading === m.code"
              @click="confirmDelete(m)"
            >
              <i v-if="deleteLoading !== m.code" class="bi bi-trash"></i>
              <i v-else class="bi bi-hourglass-split"></i>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="deleteError" class="err">{{ deleteError }}</p>
    <p v-else-if="!store.messagesLoading && !store.messagesError && !store.messages.length" class="info">
      Sin mensajes registrados.
    </p>

    <div v-if="!store.messagesLoading && (store.totalMessages > 0 || store.messages.length > 0)" class="toolbar pagination">
      <label class="page-size">
        Por página:
        <select :value="store.messagesSize" @change="store.changePageSize(Number($event.target.value))">
          <option v-for="s in [5, 10, 20, 50]" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <button :disabled="store.messagesPage <= 1 || store.messagesLoading" @click="prev">← Anterior</button>
      <span class="page-info">
        Página {{ store.messagesPage }} de {{ effectiveTotalPages }}
        <template v-if="store.totalMessages > 0"> · {{ store.totalMessages }} mensajes</template>
      </span>
      <button :disabled="store.messagesPage >= effectiveTotalPages || store.messagesLoading" @click="next">Siguiente →</button>
    </div>
  </section>
</template>

<style scoped>
.pagination { flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; margin-top: 8px; }
.page-size { display: flex; align-items: center; gap: 6px; font-size: 0.875rem; color: #6b7280; margin-right: auto; }
.page-size select { padding: 3px 6px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.875rem; }
.page-info { font-size: 0.875rem; color: #6b7280; }
.actions-cell { display: flex; gap: 4px; align-items: center; }
.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 1rem;
  color: #6b7280;
  transition: background 0.15s, color 0.15s;
}
.icon-btn:hover { background: #f3f4f6; color: #111827; }
.icon-btn.edit { color: #2563eb; }
.icon-btn.edit:hover { background: #eff6ff; color: #1d4ed8; }
.icon-btn.danger { color: #dc2626; }
.icon-btn.danger:hover { background: #fef2f2; color: #b91c1c; }
.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
