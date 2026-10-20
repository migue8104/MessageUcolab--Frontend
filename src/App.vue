<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { store, contextLabel } from './store'
import { createMessageEventService } from './messageEventService'
import ContextSelect from './components/ContextSelect.vue'
import CreateCatalog from './components/CreateCatalog.vue'
import CreateMessage from './components/CreateMessage.vue'
import ListMessages from './components/ListMessages.vue'
import TranslateMessage from './components/TranslateMessage.vue'
import ViewMessage from './components/ViewMessage.vue'
import SecurityAdministrationPage from './components/security.vue'

const tab = ref('list')
const viewCode = ref('')
const isSecurityRoute = window.location.pathname.replace(/\/+$/, '') === '/seguridad'

const activeContext = computed(() => store.activeContext)
const sseConnectionKey = computed(
  () => store.activeContext?.environmentId || store.activeContext?.environment?.id || ''
)
let messageEventService = null

function goView(code) {
  viewCode.value = code
  tab.value = 'view'
}

function goCreate() {
  tab.value = 'create'
}

function goList() {
  tab.value = 'list'
}

async function onChangeContext() {
  store.activeContext = null
  store.contexts = []
  localStorage.removeItem('activeContext')
  store.messages = []
  store.totalMessages = 0
  store.totalPages = 0
  store.messagesPage = 1
  store.messageSearch = ''
  tab.value = 'list'
  await store.loadContexts()
}

function onContextSelected() {
  tab.value = 'list'
}

async function onMessageCreated() {
  store.messageSearch = ''
  await store.loadMessages(true, 1)
}

async function onCatalogCreated(kind) {
  const updates = [store.loadCatalogs()]
  if (kind === 'application') updates.push(store.loadContexts())
  await Promise.all(updates)
}

onMounted(() => {
  if (isSecurityRoute) return

  if (store.activeContext) {
    Promise.all([store.loadCatalogs(), store.loadMessages(false, 1)])
  } else {
    store.loadContexts()
  }
})

function handleMessageEvent({ event, data }) {
  const payload = typeof data === 'string' ? null : data
  const eventType = event || payload?.type
  if (!eventType || eventType === 'heartbeat' || eventType === 'connected') return
  const currentEnvironmentId =
    store.activeContext?.environmentId || store.activeContext?.environment?.id
  if (payload?.environmentId && payload.environmentId !== currentEnvironmentId) return
  store.refreshMessagesFromEvent(payload)
}

watch(
  sseConnectionKey,
  (environmentId) => {
    if (messageEventService) {
      messageEventService.stop()
      messageEventService = null
    }
    if (isSecurityRoute || !store.isAuthenticated || !environmentId) return

    messageEventService = createMessageEventService({
      onEvent: handleMessageEvent,
      onUnauthorized: () => store.handleUnauthorized({ status: 401 })
    })
    messageEventService.start()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (messageEventService) messageEventService.stop()
})
</script>

<template>
  <SecurityAdministrationPage v-if="isSecurityRoute" />
  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">M</span>
        <div>
          <strong>Message<span>UcoLab</span></strong>
          <small>GESTIÓN DE MENSAJES</small>
        </div>
      </div>

      <p class="sidebar-label">ESPACIO DE TRABAJO</p>
      <nav v-if="store.isAuthenticated && activeContext" class="side-nav" aria-label="Navegación principal">
        <button :class="{ active: tab === 'list' }" @click="tab = 'list'">
          <span class="nav-icon" aria-hidden="true">▤</span>Mensajes
        </button>
        <button :class="{ active: tab === 'create' }" @click="tab = 'create'">
          <span class="nav-icon" aria-hidden="true">＋</span>Crear mensaje
        </button>
        <button :class="{ active: tab === 'view' }" @click="tab = 'view'">
          <span class="nav-icon" aria-hidden="true">⌕</span>Consultar
        </button>
        <button :class="{ active: tab === 'translate' }" @click="tab = 'translate'">
          <span class="nav-icon" aria-hidden="true">⇄</span>Traducir
        </button>
        <button :class="{ active: tab === 'catalog' }" @click="tab = 'catalog'">
          <span class="nav-icon" aria-hidden="true">⚙</span>Configuración
        </button>
      </nav>

      <div class="sidebar-footer">
        <span class="sidebar-status" :class="{ online: store.isAuthenticated }"></span>
        <div>
          <strong>{{ store.isAuthenticated ? 'Sesión activa' : 'Sin autenticar' }}</strong>
          <small>{{ activeContext ? 'Contexto seleccionado' : 'MessageUcoLab' }}</small>
        </div>
      </div>
    </aside>

    <div class="app-main">
      <header class="bar">
        <div class="bar-caption">
          <span>PLATAFORMA</span>
          <strong>{{ activeContext ? 'Panel de administración' : 'Gestión de mensajes' }}</strong>
        </div>
        <div class="bar-actions">
          <div v-if="store.isAuthenticated && activeContext" class="ctx-pill" aria-label="Contexto activo">
            <span class="context-dot" aria-hidden="true"></span>
            {{ contextLabel(activeContext) }}
          </div>
          <button v-if="store.isAuthenticated && activeContext" class="context-action" @click="onChangeContext">
            Cambiar contexto
          </button>
          <span v-if="store.isAuthenticated" class="badge ok">Sesión activa</span>
          <span v-else class="badge warn">Sin autenticar</span>
        </div>
      </header>

      <main class="workspace">
        <section v-if="!activeContext" class="auth-stage">
          <ContextSelect @selected="onContextSelected" />
        </section>
        <template v-else>
          <ListMessages v-if="tab === 'list'" @view="goView" @create="goCreate" />
          <CreateMessage v-else-if="tab === 'create'" @created="onMessageCreated" @cancel="goList" />
          <ViewMessage v-else-if="tab === 'view'" :code="viewCode" />
          <TranslateMessage v-else-if="tab === 'translate'" />
          <CreateCatalog v-else-if="tab === 'catalog'" @created="onCatalogCreated" />
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped>
.ctx-pill { width: min(360px, 45%); }
</style>
