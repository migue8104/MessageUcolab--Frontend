<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { store } from './store'
import { createMessageEventService } from './messageEventService'
import { sessionRecovery } from './security/session'
import SessionExpiredDialog from './components/SessionExpiredDialog.vue'
import SessionApplicationSelect from './components/SessionApplicationSelect.vue'
import CreateCatalog from './components/CreateCatalog.vue'
import CreateMessage from './components/CreateMessage.vue'
import EditMessage from './components/EditMessage.vue'
import ListMessages from './components/ListMessages.vue'
import TranslateMessage from './components/TranslateMessage.vue'
import ViewMessage from './components/ViewMessage.vue'
import SecurityAdministrationPage from './components/security.vue'

const TABS = ['list', 'create', 'view', 'translate', 'catalog']
// Al volver desde /seguridad el hash indica la sección elegida en la barra lateral.
const initialTab = window.location.hash.replace('#', '')
const tab = ref(TABS.includes(initialTab) ? initialTab : 'list')
const viewCode = ref('')
const isSecurityRoute = window.location.pathname.replace(/\/+$/, '') === '/seguridad'
const editMessage = ref(null)

const activeContext = computed(() => store.activeContext)
const hasAccess = computed(() => store.isAuthenticated && sessionRecovery.status === 'idle')
const sseConnectionKey = computed(
  () => store.activeContext?.applicationId || ''
)
let messageEventService = null

function goTab(name) {
  if (isSecurityRoute) {
    window.location.assign(`/#${name}`)
    return
  }
  tab.value = name
}

function goSecurity() {
  if (!isSecurityRoute) window.location.assign('/seguridad')
}

function goView(code) {
  viewCode.value = code
  tab.value = 'view'
}

function goCreate() {
  tab.value = 'create'
}

function goEdit(message) {
  editMessage.value = message
  tab.value = 'edit'
}

function goList() {
  tab.value = 'list'
}

async function onChangeContext() {
  store.clearSessionContext()
  store.activeOrganization = null
  store.organizationApplications = []
  tab.value = 'list'
  await store.loadSessionApplications()
}

function onContextSelected() {
  tab.value = 'list'
}

async function onMessageCreated() {
  store.messageSearch = ''
  await store.loadMessages(true, 1)
}

async function onMessageUpdated() {
  store.messageSearch = ''
  await new Promise((resolve) => setTimeout(resolve, 2500))
  await store.loadMessages(true, store.messagesPage)
}

async function onCatalogCreated() {
  await store.loadCatalogs()
}

onMounted(() => {
  if (isSecurityRoute || !hasAccess.value) return

  store.loadSessionApplications()
})

function handleMessageEvent({ event, data }) {
  const payload = typeof data === 'string' ? null : data
  const eventType = event || payload?.type
  if (!eventType || eventType === 'heartbeat' || eventType === 'connected') return
  // En modo sesión el backend ya envía solo eventos de la aplicación; se respeta el filtro activo.
  const visibleEnvironments = store.environmentFilter.length
    ? store.environmentFilter
    : null
  if (payload?.environmentId && visibleEnvironments && !visibleEnvironments.includes(payload.environmentId)) return
  if (eventType === 'MessageDeleted') {
    store.removeMessageByCode(payload?.messageCode)
    store.loadMessages(true, store.messagesPage)
    return
  }
  store.refreshMessagesFromEvent(payload)
}

watch(
  () => [sseConnectionKey.value, hasAccess.value],
  ([applicationId, authenticated]) => {
    if (messageEventService) {
      messageEventService.stop()
      messageEventService = null
    }
    if (isSecurityRoute || !authenticated || !applicationId) return

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
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">M</span>
        <div>
          <strong>Message<span>UcoLab</span></strong>
          <small>GESTIÓN DE MENSAJES</small>
        </div>
      </div>

      <p class="sidebar-label">ESPACIO DE TRABAJO</p>
      <nav v-if="hasAccess && (activeContext || isSecurityRoute)" class="side-nav" aria-label="Navegación principal">
        <button :class="{ active: !isSecurityRoute && tab === 'list' }" @click="goTab('list')">
          <span class="nav-icon" aria-hidden="true">▤</span>Mensajes
        </button>
        <button :class="{ active: !isSecurityRoute && tab === 'create' }" @click="goTab('create')">
          <span class="nav-icon" aria-hidden="true">＋</span>Crear mensaje
        </button>
        <button :class="{ active: !isSecurityRoute && tab === 'view' }" @click="goTab('view')">
          <span class="nav-icon" aria-hidden="true">⌕</span>Consultar
        </button>
        <button :class="{ active: !isSecurityRoute && tab === 'translate' }" @click="goTab('translate')">
          <span class="nav-icon" aria-hidden="true">⇄</span>Traducir
        </button>
        <button :class="{ active: !isSecurityRoute && tab === 'catalog' }" @click="goTab('catalog')">
          <span class="nav-icon" aria-hidden="true">⚙</span>Configuración
        </button>
        <button :class="{ active: isSecurityRoute }" @click="goSecurity">
          <span class="nav-icon" aria-hidden="true">🛡</span>Seguridad
        </button>
      </nav>

      <div class="sidebar-footer">
        <span class="sidebar-status" :class="{ online: hasAccess }"></span>
        <div>
          <strong>{{ hasAccess ? 'Sesión activa' : 'Acceso pendiente' }}</strong>
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
          <div v-if="hasAccess && activeContext" class="ctx-pill" aria-label="Contexto activo">
            <span class="context-dot" aria-hidden="true"></span>
            {{ activeContext.organizationName }} / {{ activeContext.applicationName }}
          </div>
          <button v-if="hasAccess && activeContext" class="context-action" @click="onChangeContext">
            Mis organizaciones
          </button>
          <span v-if="hasAccess" class="badge ok">{{ store.workspaceUser?.email || 'Sesión activa' }}</span>
          <span v-else class="badge warn">Sin autenticar</span>
        </div>
      </header>

      <main class="workspace" :inert="!hasAccess">
        <SecurityAdministrationPage v-if="isSecurityRoute && sessionRecovery.status === 'idle'" />
        <section v-else-if="!activeContext" class="auth-stage">
          <SessionApplicationSelect @selected="onContextSelected" />
        </section>
        <template v-else>
          <ListMessages v-if="tab === 'list'" @view="goView" @create="goCreate" @edit="goEdit" />
          <CreateMessage v-else-if="tab === 'create'" @created="onMessageCreated" @cancel="goList" />
          <EditMessage v-else-if="tab === 'edit' && editMessage" :message="editMessage" @updated="onMessageUpdated" @cancel="goList" />
          <ViewMessage v-else-if="tab === 'view'" :code="viewCode" />
          <TranslateMessage v-else-if="tab === 'translate'" />
          <CreateCatalog v-else-if="tab === 'catalog'" @created="onCatalogCreated" />
        </template>
      </main>
    </div>
  </div>
  <SessionExpiredDialog />
</template>

<style scoped>
.ctx-pill { width: min(360px, 45%); }
</style>
