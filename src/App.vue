<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { store } from './store'
import { createMessageEventService } from './messageEventService'
import { useWorkspaceNavigation } from './workspaceNavigation'
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
import ParametrosAdministrationPage from './components/parametros.vue'
import AppIcon from './components/ui/AppIcon.vue'

const currentPath = window.location.pathname.replace(/\/+$/, '')
const isSecurityRoute = currentPath === '/seguridad'
const isParametrosRoute = currentPath === '/parametros'
const isExternalRoute = isSecurityRoute || isParametrosRoute
const { tab, viewCode, editMessage, navigationLoading, navigationError, goTab: navigateTab, goView, goEdit, onWorkspaceSelected } = useWorkspaceNavigation(isExternalRoute)
const sidebarOpen = ref(false)
const mobile = ref(window.matchMedia('(max-width: 760px)').matches)
const mobileQuery = window.matchMedia('(max-width: 760px)')
const menuTrigger = ref(null)
const sidebarElement = ref(null)
const tabLabels = { list: 'Mensajes', create: 'Crear mensaje', view: 'Consultar', translate: 'Traducir', catalog: 'Configuración', edit: 'Editar mensaje' }
const currentModule = computed(() => isSecurityRoute ? 'Seguridad' : isParametrosRoute ? 'Parámetros' : !activeContext.value ? (store.activeOrganization ? `${store.activeOrganization.name} › Mis aplicaciones` : 'Mis organizaciones') : tabLabels[tab.value])
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
const messageEventsWarning = computed(() => {
  if (store.messageEventsStatus === 'forbidden') {
    return 'La actualización automática está bloqueada. Solicita revisar el permiso GET /messageucolab/v1/messages/events en seguridad.'
  }
  return ['error', 'reconnecting', 'disconnected'].includes(store.messageEventsStatus)
    ? 'Se perdió la conexión de actualizaciones. El listado se sincronizará automáticamente al reconectar.'
    : ''
})

function reconnectMessageEvents() {
  messageEventService?.stop()
  messageEventService?.start()
}

function goTab(name) {
  sidebarOpen.value = false
  navigateTab(name)
}

function goSecurity() {
  sidebarOpen.value = false
  if (!isSecurityRoute) window.location.assign('/seguridad')
}

function goParametros() {
  sidebarOpen.value = false
  if (!isParametrosRoute) window.location.assign('/parametros')
}

function goCreate() {
  goTab('create')
}

function goList() {
  goTab('list')
}

async function onChangeContext() {
  sidebarOpen.value = false
  store.clearSessionContext()
  store.activeOrganization = null
  store.organizationApplications = []
  tab.value = 'list'
  if (isExternalRoute) { window.location.assign('/#list'); return }
  await store.loadSessionApplications()
  onWorkspaceSelected()
}

function onContextSelected() {
  onWorkspaceSelected()
}

async function onMessageCreated() {
  store.messageSearch = ''
  await store.loadMessages(true, 1)
}

function onMessageUpdated() {
  // The backend announces when the projected list is ready; no fixed wait or page reload.
  store.scheduleMessageRefresh({ type: 'MutationAccepted' })
}

async function onCatalogCreated() {
  await store.loadCatalogs()
}

onMounted(() => {
  mobileQuery.addEventListener('change', onViewportChange)
})

function handleMessageEvent({ event, data }) {
  const payload = typeof data === 'string' ? null : data
  const eventType = event || payload?.type
  if (!eventType || eventType === 'heartbeat') return
  if (payload?.applicationId && payload.applicationId !== store.activeContext?.applicationId) return
  // En modo sesión el backend ya envía solo eventos de la aplicación; se respeta el filtro activo.
  const visibleEnvironments = store.environmentFilter.length
    ? store.environmentFilter
    : null
  if (payload?.environmentId && visibleEnvironments && !visibleEnvironments.includes(payload.environmentId)) return
  if (eventType === 'MessageDeleted') {
    store.removeMessageByCode(payload?.messageCode)
  }
  store.scheduleMessageRefresh({ ...payload, type: eventType })
}

watch(
  () => [sseConnectionKey.value, hasAccess.value],
  ([applicationId, authenticated]) => {
    if (messageEventService) {
      messageEventService.stop()
      messageEventService = null
    }
    store.messageEventsStatus = 'disconnected'
    if (isExternalRoute || !authenticated || !applicationId) return

    messageEventService = createMessageEventService({
      onEvent: (event) => {
        if (applicationId === store.activeContext?.applicationId && hasAccess.value) handleMessageEvent(event)
      },
      onStatus: (status) => {
        if (applicationId === store.activeContext?.applicationId) store.messageEventsStatus = status
      },
      onUnauthorized: () => {
        if (applicationId === store.activeContext?.applicationId) store.handleUnauthorized({ status: 401 })
      }
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
    <aside id="workspace-sidebar" ref="sidebarElement" class="sidebar business-ui" :class="{ 'is-open': sidebarOpen }" :inert="navigationLoading || (mobile && !sidebarOpen)" @keydown.tab="onSidebarTab">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">M</span>
        <div>
          <strong>Message<span>UcoLab</span></strong>
          <small>GESTIÓN DE MENSAJES</small>
        </div>
        <button class="mobile-menu sidebar-close icon-button" aria-label="Cerrar menú" @click="sidebarOpen = false"><AppIcon name="close" /></button>
      </div>

      <p class="sidebar-label">ESPACIO DE TRABAJO</p>
      <nav v-if="hasAccess && (activeContext || isExternalRoute)" class="side-nav" aria-label="Navegación principal">
        <button :class="{ active: !isExternalRoute && tab === 'list' }" :aria-current="!isExternalRoute && tab === 'list' ? 'page' : undefined" @click="goTab('list')">
          <AppIcon name="messages" />Mensajes
        </button>
        <button :class="{ active: !isExternalRoute && tab === 'create' }" :aria-current="!isExternalRoute && tab === 'create' ? 'page' : undefined" @click="goTab('create')">
          <AppIcon name="plus" />Crear mensaje
        </button>
        <button :class="{ active: !isExternalRoute && tab === 'view' }" :aria-current="!isExternalRoute && tab === 'view' ? 'page' : undefined" @click="goTab('view')">
          <AppIcon name="search" />Consultar
        </button>
        <button :class="{ active: !isExternalRoute && tab === 'translate' }" :aria-current="!isExternalRoute && tab === 'translate' ? 'page' : undefined" @click="goTab('translate')">
          <AppIcon name="translate" />Traducir
        </button>
        <button :class="{ active: !isExternalRoute && tab === 'catalog' }" :aria-current="!isExternalRoute && tab === 'catalog' ? 'page' : undefined" @click="goTab('catalog')">
          <AppIcon name="settings" />Configuración
        </button>
        <button :class="{ active: isSecurityRoute }" :aria-current="isSecurityRoute ? 'page' : undefined" @click="goSecurity">
          <AppIcon name="shield" />Seguridad
        </button>
        <button :class="{ active: isParametrosRoute }" :aria-current="isParametrosRoute ? 'page' : undefined" @click="goParametros">
          <AppIcon name="settings" />Parámetros
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
      <header class="bar business-ui" :inert="navigationLoading">
        <button ref="menuTrigger" class="mobile-menu icon-button secondary" aria-label="Abrir menú de navegación" :aria-expanded="sidebarOpen" aria-controls="workspace-sidebar" @click="sidebarOpen = !sidebarOpen"><AppIcon name="menu" /></button>
        <div class="bar-caption">
          <span>PLATAFORMA</span>
          <strong>{{ currentModule }}</strong>
        </div>
        <div class="bar-actions">
          <button v-if="hasAccess" class="ctx-pill" title="Cambiar organización o aplicación" aria-label="Cambiar organización o aplicación" @click="onChangeContext"><AppIcon name="building" :size="15" /><span>{{ activeContext ? `${activeContext.organizationName} / ${activeContext.applicationName}` : store.activeOrganization?.name || 'Mis organizaciones' }}</span><AppIcon name="down" :size="13" /></button>
          <details v-if="hasAccess" class="user-menu">
            <summary><span class="user-avatar">{{ userInitial }}</span><span class="user-greeting">{{ store.workspaceUser?.name ? `Bienvenido, ${store.workspaceUser.name}` : 'Bienvenido' }}</span><AppIcon name="down" :size="13" /></summary>
            <div class="user-dropdown">
              <strong>{{ store.workspaceUser?.name || 'Mi cuenta' }}</strong>
              <span>{{ store.workspaceUser?.email }}</span>
              <span class="session-label"><i />Sesión activa</span>
            </div>
          </details>
          <span v-else class="badge warn" role="status">Sin autenticar</span>
        </div>
      </header>

      <main class="workspace" :class="{ 'business-ui': !isExternalRoute }" :inert="!hasAccess || navigationLoading">
        <p v-if="navigationError" class="alert error" role="alert">{{ navigationError }}</p>
        <SecurityAdministrationPage v-if="isSecurityRoute && sessionRecovery.status === 'idle'" />
        <ParametrosAdministrationPage v-else-if="isParametrosRoute && sessionRecovery.status === 'idle'" />
        <section v-else-if="navigationLoading || (store.contextsLoading && !activeContext)" class="card" role="status" aria-live="polite">
          <p class="info">Recuperando tu espacio de trabajo…</p>
        </section>
        <section v-else-if="!activeContext" class="auth-stage">
          <SessionApplicationSelect @selected="onContextSelected" @workspace-selected="onWorkspaceSelected" />
        </section>
        <template v-else>
          <p v-if="messageEventsWarning" class="alert warning" role="status" aria-live="polite">{{ messageEventsWarning }} <button type="button" class="link" @click="reconnectMessageEvents">Reconectar actualizaciones</button></p>
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
