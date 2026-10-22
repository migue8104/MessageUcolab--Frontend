import { reactive } from 'vue'
import { catalogApi, messageApi, sessionApi, workspaceApi, toMessageCode, setRequestContext } from './api'
import { recoverUnauthorized } from './security/session'

// Seguridad autentica; MessageUcoLab valida la propiedad de organizaciones y aplicaciones.
const CONTEXT_STORAGE_KEY = 'personalWorkspaceContext'

// Los catálogos ya devuelven ids UUID; se usan esos valores para enviarlos
// tal cual en la creación de mensajes. Fallback al nombre en minúsculas si no hay id.
function toOptions(list) {
  return list.map((item) => ({
    name: item.name,
    value: item.id && item.id !== '0' ? item.id : item.name.toLowerCase()
  }))
}

// Acepta el envelope paginado actual y el formato legado que envolvía la página en un arreglo.
function unwrapPage(result) {
  const payload = result?.data ?? result
  if (Array.isArray(payload)) {
    const legacyPage = payload.find((item) => item && Array.isArray(item.data))
    if (legacyPage) return legacyPage
    return {
      data: payload,
      totalItems: result?.totalItems ?? 0,
      totalPages: result?.totalPages ?? 0
    }
  }
  return payload || {}
}

// Nunca mostrar datos de un contexto guardado antes de validar la sesion actual.

function unwrapList(data) {
  return Array.isArray(data) ? data : data && Array.isArray(data.data) ? data.data : []
}

function saveContext(context) {
  try {
    if (context) localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(context))
    else localStorage.removeItem(CONTEXT_STORAGE_KEY)
  } catch {
    // El contexto solo se conserva como conveniencia del navegador.
  }
}

// Estado global compartido entre todos los componentes (reactivo).
export const store = reactive({
  isAuthenticated: false,
  setSession() {
    this.isAuthenticated = true
  },

  activeContext: null,
  workspaceUser: null,
  organizations: [],
  activeOrganization: null,
  organizationApplications: [],
  contextsLoading: false,
  contextsError: '',

  // Aplicaciones de las organizaciones propias y ambientes de la aplicación activa.
  sessionApplications: [],
  environments: [],
  // Ambientes visibles en el listado; vacío = todos los de la aplicación.
  environmentFilter: [],

  handleUnauthorized(error) {
    if (error.status !== 401 && error.code !== 'UNAUTHORIZED') return

    this.isAuthenticated = false
    this.clearSessionContext()
    this.workspaceUser = null
    this.organizations = []
    this.activeOrganization = null
    this.organizationApplications = []
    this.sessionApplications = []
    this.messages = []
    this.applications = []
    this.types = []
    this.categories = []
    this.states = []
    if (this.messageRefreshTimer) clearTimeout(this.messageRefreshTimer)
    this.messageRefreshTimer = null
    this.messageRefreshPending = null
    return recoverUnauthorized()
  },

  // Catálogos globales (compartidos entre pestañas)
  applications: [],
  types: [],
  categories: [],
  states: [],
  catalogsLoading: false,
  catalogsError: '',

  // Opciones fijas para catálogos sin endpoint dedicado (UUIDs del seed SurrealDB)
  languages: [
    { value: '6319ca87-47b3-4e0e-994f-3166378988f2', name: 'English' },
    { value: 'bed4d574-4c7f-4d95-bc12-6dbbcdbbf4fc', name: 'Spanish' },
    { value: '8cc7ae54-db8c-4ef1-929b-22e17de58129', name: 'French' }
  ],
  applicationStates: [
    { value: 'dfb7a7cb-66f6-4b73-a1d8-803336f72ebe', name: 'Active' },
    { value: '2a0ddacd-2dcc-47e2-b56f-03db5207c443', name: 'Inactive' }
  ],
  functionalityStates: [
    { value: '407de974-c8aa-43e2-a5cf-22dc7c44054b', name: 'Active' },
    { value: '505cde87-96f2-4926-8dc6-b04529469bd3', name: 'Inactive' }
  ],

  // Lista de mensajes (página actual)
  messages: [],
  totalMessages: 0,
  totalPages: 1,
  messagesPage: 1,
  messagesSize: 20,
  messageSearch: '',
  messagesLoading: false,
  messagesError: '',
  messageRefreshTimer: null,
  messageRefreshInFlight: false,
  messageRefreshPending: null,

  resetMessages() {
    this.messages = []
    this.totalMessages = 0
    this.totalPages = 0
    this.messagesPage = 1
    this.messageSearch = ''
  },

  async loadSessionApplications() {
    if (!this.isAuthenticated) return
    this.contextsLoading = true
    this.contextsError = ''
    try {
      const user = await sessionApi.user()
      const [organizations, applications] = await Promise.all([
        workspaceApi.organizations(), sessionApi.applications()
      ])
      this.workspaceUser = unwrapList(user)[0] || null
      this.organizations = unwrapList(organizations)
      this.sessionApplications = unwrapList(applications)
      const registered = this.sessionApplications.filter((app) => app.registered)
      const current = this.activeContext
        && registered.find((app) => app.id === this.activeContext.applicationId)
      if (current) {
        await this.selectSessionApplication(current)
      } else {
        this.clearSessionContext()
      }
    } catch (e) {
      this.handleUnauthorized(e)
      this.contextsError = e.status === 403
        ? 'No tienes permiso para consultar tu espacio de trabajo. Solicita revisar los permisos de las rutas en seguridad.'
        : e.message
    } finally {
      this.contextsLoading = false
    }
  },

  async selectOrganization(organization) {
    this.contextsLoading = true
    this.contextsError = ''
    this.organizationApplications = []
    this.activeOrganization = null
    try {
      const applications = unwrapList(await workspaceApi.applications(organization.id))
      this.activeOrganization = organization
      this.organizationApplications = applications
    } catch (e) {
      this.handleUnauthorized(e)
      this.contextsError = e.message
      throw e
    } finally {
      this.contextsLoading = false
    }
  },

  async createPersonalOrganization(name) {
    const created = unwrapList(await workspaceApi.createOrganization(name))[0]
    await this.loadSessionApplications()
    if (created) await this.selectOrganization(created)
  },

  async createPersonalApplication(payload) {
    const organization = this.activeOrganization
    if (!organization) return
    await messageApi.createApplication({ ...payload, organizationId: organization.id })
    await this.loadSessionApplications()
    await this.selectOrganization(organization)
  },

  async selectSessionApplication(app) {
    this.contextsError = ''
    try {
      const organization = app.organization || null
      this.activeContext = {
        applicationId: app.id,
        applicationName: app.name,
        application: { id: app.id, name: app.name },
        organizationId: organization?.id || '',
        organizationName: organization?.name || '',
        organization
      }
      setRequestContext(this.activeContext)
      saveContext(this.activeContext)
      this.environments = unwrapList(await catalogApi.environments(app.id))
      this.environmentFilter = this.environmentFilter
        .filter((id) => this.environments.some((env) => env.id === id))
      this.resetMessages()
      await Promise.all([this.loadMessages(false, 1), this.loadCatalogs()])
    } catch (e) {
      this.clearSessionContext()
      this.handleUnauthorized(e)
      this.contextsError = e.message
      throw e
    }
  },

  async setEnvironmentFilter(environmentIds) {
    this.environmentFilter = environmentIds
    this.messageSearch = ''
    await this.loadMessages(false, 1)
  },

  clearSessionContext() {
    this.activeContext = null
    this.environments = []
    this.environmentFilter = []
    setRequestContext()
    saveContext(null)
    this.resetMessages()
  },

  async loadCatalogs(silent = false) {
    if (!silent) this.catalogsLoading = true
    this.catalogsError = ''
    try {
      const [apps, types, cats, sts] = await Promise.all([
        catalogApi.applications(),
        catalogApi.messageTypes(),
        catalogApi.messageCategories(),
        catalogApi.messageStates()
      ])
      this.applications = apps
      this.types = toOptions(types)
      this.categories = toOptions(cats)
      this.states = toOptions(sts)
    } catch (e) {
      this.handleUnauthorized(e)
      this.catalogsError = e.message
    } finally {
      this.catalogsLoading = false
    }
  },

  async loadMessages(silent = false, page = this.messagesPage) {
    this.messagesError = ''
    // Sin sesiÃ³n confirmada no se consultan los recursos protegidos.
    if (!this.isAuthenticated) {
      this.messages = []
      this.messagesLoading = false
      return
    }
    if (!silent) this.messagesLoading = true
    try {
      const res = unwrapPage(await messageApi.list(page, this.messagesSize, this.environmentFilter))
      this.messages = res.data || []
      this.totalMessages = res.totalItems ?? 0
      this.totalPages = res.totalPages ?? 0
      this.messagesPage = page
    } catch (e) {
      this.handleUnauthorized(e)
      this.messagesError = e.message
      this.messages = []
    } finally {
      this.messagesLoading = false
    }
  },

  scheduleMessageRefresh(event = null) {
    this.messageRefreshPending = event
    if (this.messageRefreshTimer) clearTimeout(this.messageRefreshTimer)
    this.messageRefreshTimer = setTimeout(() => {
      this.messageRefreshTimer = null
      const pendingEvent = this.messageRefreshPending
      this.messageRefreshPending = null
      this.refreshMessagesFromEvent(pendingEvent)
    }, 150)
  },

  async refreshMessagesFromEvent(event = null) {
    if (this.messageRefreshInFlight) {
      this.messageRefreshPending = event
      return
    }
    this.messageRefreshInFlight = true
    try {
      const eventCode = toMessageCode(event?.messageCode)
      if (this.messageSearch) {
        const data = await messageApi.byCode(this.messageSearch)
        const result = Array.isArray(data) ? data : data && data.data ? data.data : []
        this.messages = result.slice(0, 1)
        this.totalMessages = this.messages.length
        this.totalPages = 1
      } else if (eventCode) {
        const data = await messageApi.byCode(eventCode)
        const result = Array.isArray(data) ? data : data && data.data ? data.data : []
        const message = result[0]
        if (message) {
          const currentIndex = this.messages.findIndex((item) => item.code === message.code)
          if (currentIndex === -1) {
            this.messages = [message, ...this.messages]
            this.totalMessages += 1
          } else {
            this.messages.splice(currentIndex, 1, message)
          }
        }
      }
      if (!this.messageSearch) {
        await this.loadMessages(true, this.messagesPage)
      }
    } catch (e) {
      this.handleUnauthorized(e)
      this.messagesError = e.message
    } finally {
      this.messageRefreshInFlight = false
      if (this.messageRefreshPending) {
        const pendingEvent = this.messageRefreshPending
        this.messageRefreshPending = null
        this.scheduleMessageRefresh(pendingEvent)
      }
    }
  },

  removeMessageByCode(code) {
    if (!code) return
    const before = this.messages.length
    this.messages = this.messages.filter((m) => m.code !== code)
    if (this.messages.length < before) {
      this.totalMessages = Math.max(this.messages.length, this.totalMessages - 1)
    }
  },

  async setMessagesPage(page) {
    if (page < 1 || page === this.messagesPage) return
    this.messagesPage = page
    await this.loadMessages(false, page)
  },

  async changePageSize(size) {
    if (!size || size === this.messagesSize) return
    this.messagesSize = size
    this.messagesPage = 1
    await this.loadMessages(false, 1)
  },

  async refresh(silent = true) {
    // Los contextos NO se consultan aquí: solo cambian al autenticar o
    // al entrar al selector, evitando peticiones extra al backend.
    this.messageSearch = ''
    await Promise.all([this.loadCatalogs(silent), this.loadMessages(silent)])
  }
})
