import { onBeforeUnmount, onMounted, ref } from 'vue'
import { messageApi } from './api'
import { store } from './store'
import { sessionRecovery } from './security/session'

const TABS = ['list', 'create', 'view', 'translate', 'catalog', 'edit']
const HISTORY_KEY = 'messageucolabNavigation'
const HISTORY_ROOT_KEY = 'messageucolabWorkspaceHistory'
const HISTORY_BOUNDARY_KEY = 'messageucolabWorkspaceBoundary'
const ORGANIZATIONS_ROUTE = { tab: 'organizations', applicationId: '', organizationId: '', code: '' }

export function useWorkspaceNavigation(isSecurityRoute) {
  const initialTab = window.location.hash.slice(1)
  const tab = ref(TABS.includes(initialTab) ? initialTab : 'list')
  const viewCode = ref('')
  const editMessage = ref(null)
  const navigationLoading = ref(!isSecurityRoute)
  const navigationError = ref('')
  let ready = false
  let historyInitialized = false
  let navigationVersion = 0
  let pendingNavigation = Promise.resolve()

  function currentRoute() {
    const applicationId = store.activeContext?.applicationId || ''
    const organizationId = applicationId ? store.activeContext.organizationId || '' : store.activeOrganization?.id || ''
    return {
      tab: applicationId ? tab.value : organizationId ? 'applications' : 'organizations',
      applicationId,
      organizationId,
      code: applicationId && tab.value === 'edit' ? editMessage.value?.code || ''
        : applicationId && tab.value === 'view' ? viewCode.value : ''
    }
  }

  function writeNavigation(route, replace = false, initializeRoot = false) {
    if (!replace && !window.history.state?.[HISTORY_BOUNDARY_KEY]
        && JSON.stringify(window.history.state?.[HISTORY_KEY]) === JSON.stringify(route)) return
    const url = new URL(window.location.href)
    url.hash = route.tab
    const state = { ...window.history.state, [HISTORY_KEY]: route }
    delete state[HISTORY_BOUNDARY_KEY]
    if (initializeRoot) state[HISTORY_ROOT_KEY] = 2
    if (replace) window.history.replaceState(state, '', url)
    else window.history.pushState(state, '', url)
  }

  function recordNavigation(replace = false) {
    if (isSecurityRoute || !ready) return
    const route = currentRoute()
    if (!replace && route.tab === 'organizations') {
      if (window.history.state?.[HISTORY_KEY]?.tab !== 'organizations') writeRootBoundary(false)
      return
    }
    writeNavigation(route, replace)
  }

  function writeRootBoundary(replace) {
    writeNavigation(ORGANIZATIONS_ROUTE, replace, true)
    // La entrada anterior permanece en el mismo documento para interceptar Atrás.
    window.history.replaceState({ ...window.history.state, [HISTORY_BOUNDARY_KEY]: true }, '')
    writeNavigation(ORGANIZATIONS_ROUTE)
  }

  function initializeHistory() {
    const route = currentRoute()
    if (window.history.state?.[HISTORY_ROOT_KEY] === 2) {
      // Recuperar también una recarga realizada sobre la entrada de límite.
      if (window.history.state?.[HISTORY_BOUNDARY_KEY]) writeNavigation(ORGANIZATIONS_ROUTE)
      writeNavigation(route, true)
      return
    }
    // La aplicación recordada también debe tener sus pantallas padre en el historial.
    writeRootBoundary(true)
    if (route.organizationId) {
      writeNavigation({ tab: 'applications', applicationId: '', organizationId: route.organizationId, code: '' })
    }
    if (route.applicationId) {
      writeNavigation({ ...route, tab: 'list', code: '' })
      if (route.tab !== 'list') writeNavigation(route)
    }
  }

  function readRoute() {
    const name = window.location.hash.slice(1)
    const saved = window.history.state?.[HISTORY_KEY]
    if (saved?.tab === name) return saved
    const workspace = name === 'organizations' || name === 'applications'
    return {
      tab: workspace || TABS.includes(name) ? name : 'list',
      applicationId: workspace ? '' : store.activeContext?.applicationId || '',
      organizationId: name === 'organizations' ? '' : store.activeOrganization?.id || '',
      code: ''
    }
  }

  async function restoreWorkspace(route) {
    if (route.applicationId) {
      const app = store.sessionApplications.find((item) => item.registered && item.id === route.applicationId)
      if (app) {
        if (store.activeContext?.applicationId !== app.id) await store.selectSessionApplication(app)
        return
      }
      navigationError.value = 'La aplicación de esta vista ya no está disponible en tu espacio de trabajo.'
    }
    store.clearSessionContext()
    store.activeOrganization = null
    store.organizationApplications = []
    const organization = store.organizations.find((item) => item.id === route.organizationId)
    if (organization) await store.selectOrganization(organization)
  }

  async function restoreRoute(route) {
    if (!store.isAuthenticated || sessionRecovery.status !== 'idle') return
    navigationError.value = ''
    tab.value = 'list'
    viewCode.value = ''
    editMessage.value = null
    await restoreWorkspace(route)
    if (!store.activeContext || !store.isAuthenticated) return
    viewCode.value = typeof route.code === 'string' ? route.code : ''
    if (route.tab === 'edit' && viewCode.value) {
      const result = await messageApi.byCode(viewCode.value)
      editMessage.value = Array.isArray(result) ? result[0] || null : result
      tab.value = editMessage.value ? 'edit' : 'view'
    } else {
      tab.value = TABS.includes(route.tab) && route.tab !== 'edit' ? route.tab : 'list'
    }
  }

  function restoreNavigation(route) {
    const version = ++navigationVersion
    navigationLoading.value = true
    // Serializar Atrás/Adelante evita que una consulta tardía restaure otro contexto.
    pendingNavigation = pendingNavigation.then(() => restoreRoute(route)).catch((error) => {
      store.handleUnauthorized(error)
      navigationError.value = error.message
    }).finally(() => {
      if (version !== navigationVersion) return
      navigationLoading.value = false
      if (historyInitialized) recordNavigation(true)
      else {
        initializeHistory()
        historyInitialized = true
      }
    })
    return pendingNavigation
  }

  function onPopState(event) {
    if (!ready || isSecurityRoute || !store.isAuthenticated || sessionRecovery.status !== 'idle') return
    if (event.state?.[HISTORY_BOUNDARY_KEY]) {
      window.history.forward()
      return
    }
    restoreNavigation(readRoute())
  }

  function goTab(name) {
    if (!TABS.includes(name) || navigationLoading.value) return
    if (isSecurityRoute) {
      window.location.assign(`/#${name}`)
      return
    }
    navigationError.value = ''
    tab.value = name
    recordNavigation()
  }

  function goView(code) {
    viewCode.value = code
    goTab('view')
  }

  function goEdit(message) {
    editMessage.value = message
    goTab('edit')
  }

  function onWorkspaceSelected() {
    navigationError.value = ''
    tab.value = 'list'
    viewCode.value = ''
    editMessage.value = null
    recordNavigation()
  }

  onMounted(async () => {
    window.addEventListener('popstate', onPopState)
    if (!store.isAuthenticated || sessionRecovery.status !== 'idle') {
      navigationLoading.value = false
      return
    }
    await store.loadSessionApplications({ loadWorkspace: !isSecurityRoute })
    ready = true
    if (!isSecurityRoute) await restoreNavigation(readRoute())
  })

  onBeforeUnmount(() => {
    ready = false
    window.removeEventListener('popstate', onPopState)
  })

  return { tab, viewCode, editMessage, navigationLoading, navigationError, goTab, goView, goEdit, onWorkspaceSelected }
}
