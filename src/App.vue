<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
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
import AppIcon from './components/ui/AppIcon.vue'

const TABS = ['list', 'create', 'view', 'translate', 'catalog']
// Al volver desde /seguridad el hash indica la sección elegida en la barra lateral.
const initialTab = window.location.hash.replace('#', '')
const tab = ref(TABS.includes(initialTab) ? initialTab : 'list')
const viewCode = ref('')
const isSecurityRoute = window.location.pathname.replace(/\/+$/, '') === '/seguridad'
const editMessage = ref(null)
const sidebarOpen = ref(false)
const mobile = ref(window.matchMedia('(max-width: 760px)').matches)
const mobileQuery = window.matchMedia('(max-width: 760px)')
const menuTrigger = ref(null)
const sidebarElement = ref(null)
const tabLabels = { list: 'Mensajes', create: 'Crear mensaje', view: 'Consultar', translate: 'Traducir', catalog: 'Configuración', edit: 'Editar mensaje' }
const currentModule = computed(() => isSecurityRoute ? 'Seguridad' : !activeContext.value ? (store.activeOrganization ? `${store.activeOrganization.name} › Mis aplicaciones` : 'Mis organizaciones') : tabLabels[tab.value])
const userInitial = computed(() => (store.workspaceUser?.name || store.workspaceUser?.email || 'U').slice(0, 1).toUpperCase())
function onViewportChange(event) { mobile.value = event.matches; sidebarOpen.value = false }

watch(sidebarOpen, async (open) => {
  if (!mobile.value) return
  await nextTick()
  if (open) sidebarElement.value?.querySelector('button')?.focus()
  else menuTrigger.value?.focus()
})

function onSidebarTab(event) {
  if (!mobile.value || !sidebarOpen.value) return
  const elements = [...sidebarElement.value.querySelectorAll('button:not(:disabled), a[href]')]
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}

const activeContext = computed(() => store.activeContext)
const hasAccess = computed(() => store.isAuthenticated && sessionRecovery.status === 'idle')
const sseConnectionKey = computed(
  () => store.activeContext?.applicationId || ''
)
let messageEventService = null

function goTab(name) {
  sidebarOpen.value = false
  if (isSecurityRoute) {
    window.location.assign(`/#${name}`)
    return
  }
  tab.value = name
  window.history.replaceState(null, '', `/#${name}`)
}

function goSecurity() {
  sidebarOpen.value = false
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
  sidebarOpen.value = false
  store.clearSessionContext()
  store.activeOrganization = null
  store.organizationApplications = []
  tab.value = 'list'
  if (isSecurityRoute) { window.location.assign('/#list'); return }
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
  mobileQuery.addEventListener('change', onViewportChange)
  if (!hasAccess.value) return

  store.loadSessionApplications({ loadWorkspace: !isSecurityRoute })
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
  }
  store.refreshMessagesFromEvent({ ...payload, type: eventType })
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
  mobileQuery.removeEventListener('change', onViewportChange)
  if (messageEventService) messageEventService.stop()
})
</script>

<template>
  <div class="app-shell" @keydown.esc="sidebarOpen = false">
    <button v-if="sidebarOpen && mobile" class="sidebar-scrim" tabindex="-1" aria-label="Cerrar menú" @click="sidebarOpen = false"></button>
    <aside id="workspace-sidebar" ref="sidebarElement" class="sidebar business-ui" :class="{ 'is-open': sidebarOpen }" :inert="mobile && !sidebarOpen" @keydown.tab="onSidebarTab">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">M</span>
        <div>
          <strong>Message<span>UcoLab</span></strong>
          <small>GESTIÓN DE MENSAJES</small>
        </div>
        <button class="mobile-menu sidebar-close icon-button" aria-label="Cerrar menú" @click="sidebarOpen = false"><AppIcon name="close" /></button>
      </div>

      <p class="sidebar-label">ESPACIO DE TRABAJO</p>
      <nav v-if="hasAccess && (activeContext || isSecurityRoute)" class="side-nav" aria-label="Navegación principal">
        <button :class="{ active: !isSecurityRoute && tab === 'list' }" :aria-current="!isSecurityRoute && tab === 'list' ? 'page' : undefined" @click="goTab('list')">
          <AppIcon name="messages" />Mensajes
        </button>
        <button :class="{ active: !isSecurityRoute && tab === 'create' }" :aria-current="!isSecurityRoute && tab === 'create' ? 'page' : undefined" @click="goTab('create')">
          <AppIcon name="plus" />Crear mensaje
        </button>
        <button :class="{ active: !isSecurityRoute && tab === 'view' }" :aria-current="!isSecurityRoute && tab === 'view' ? 'page' : undefined" @click="goTab('view')">
          <AppIcon name="search" />Consultar
        </button>
        <button :class="{ active: !isSecurityRoute && tab === 'translate' }" :aria-current="!isSecurityRoute && tab === 'translate' ? 'page' : undefined" @click="goTab('translate')">
          <AppIcon name="translate" />Traducir
        </button>
        <button :class="{ active: !isSecurityRoute && tab === 'catalog' }" :aria-current="!isSecurityRoute && tab === 'catalog' ? 'page' : undefined" @click="goTab('catalog')">
          <AppIcon name="settings" />Configuración
        </button>
        <button :class="{ active: isSecurityRoute }" :aria-current="isSecurityRoute ? 'page' : undefined" @click="goSecurity">
          <AppIcon name="shield" />Seguridad
        </button>
      </nav>
      <div v-else class="sidebar-hint"><AppIcon name="building" /><p>Selecciona una aplicación para acceder a tus mensajes.</p></div>

      <div class="sidebar-footer">
        <span class="sidebar-status" :class="{ online: hasAccess }"></span>
        <div>
          <strong>{{ hasAccess ? 'Sesión activa' : 'Acceso pendiente' }}</strong>
          <small>{{ activeContext ? `${activeContext.organizationName} / ${activeContext.applicationName}` : 'MessageUcoLab' }}</small>
        </div>
      </div>
    </aside>

    <div class="app-main" :inert="mobile && sidebarOpen">
      <header class="bar business-ui">
        <button ref="menuTrigger" class="mobile-menu icon-button secondary" aria-label="Abrir menú de navegación" :aria-expanded="sidebarOpen" aria-controls="workspace-sidebar" @click="sidebarOpen = !sidebarOpen"><AppIcon name="menu" /></button>
        <div class="bar-caption">
          <span>PLATAFORMA</span>
          <strong>{{ currentModule }}</strong>
        </div>
        <div class="bar-actions">
          <button v-if="hasAccess" class="ctx-pill" title="Cambiar organización o aplicación" aria-label="Cambiar organización o aplicación" @click="onChangeContext"><AppIcon name="building" :size="15" /><span>{{ activeContext ? `${activeContext.organizationName} / ${activeContext.applicationName}` : store.activeOrganization?.name || 'Mis organizaciones' }}</span><AppIcon name="down" :size="13" /></button>
          <details v-if="hasAccess" class="user-menu">
            <summary><span class="user-avatar">{{ userInitial }}</span><span class="user-email">{{ store.workspaceUser?.email || 'Sesión activa' }}</span><AppIcon name="down" :size="13" /></summary>
            <div class="user-dropdown">
              <strong>{{ store.workspaceUser?.name || 'Mi cuenta' }}</strong>
              <span>{{ store.workspaceUser?.email }}</span>
              <span class="session-label"><i />Sesión activa</span>
            </div>
          </details>
          <span v-else class="badge warn" role="status">Sin autenticar</span>
        </div>
      </header>

      <main class="workspace" :class="{ 'business-ui': !isSecurityRoute }" :inert="!hasAccess">
        <SecurityAdministrationPage v-if="isSecurityRoute && sessionRecovery.status === 'idle'" />
        <section v-else-if="store.contextsLoading && !activeContext" class="card" role="status" aria-live="polite">
          <p class="info">Recuperando tu espacio de trabajo…</p>
        </section>
        <section v-else-if="!activeContext" class="auth-stage">
          <SessionApplicationSelect @selected="onContextSelected" />
        </section>
        <template v-else>
          <ListMessages v-if="tab === 'list'" @view="goView" @create="goCreate" />
          <CreateMessage v-else-if="tab === 'create'" @created="onMessageCreated" @cancel="goList" />
          <EditMessage v-else-if="tab === 'edit' && editMessage" :message="editMessage" @updated="onMessageUpdated" @cancel="goList" />
          <ViewMessage v-else-if="tab === 'view'" :code="viewCode" @edit="goEdit" />
          <TranslateMessage v-else-if="tab === 'translate'" />
          <CreateCatalog v-else-if="tab === 'catalog'" @created="onCatalogCreated" />
        </template>
      </main>
    </div>
  </div>
  <SessionExpiredDialog />
</template>
