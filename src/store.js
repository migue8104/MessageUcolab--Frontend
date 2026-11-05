import { reactive } from 'vue'
import { catalogApi, messageApi, sessionApi, workspaceApi, setRequestContext } from './api'
import { recoverUnauthorized } from './security/session'
import { catalogLabel } from './presentation'

// Seguridad autentica; MessageUcoLab valida la propiedad de organizaciones y aplicaciones.
const CONTEXT_STORAGE_KEY = 'personalWorkspaceContext'

// Los catálogos ya devuelven ids UUID; se usan esos valores para enviarlos
// tal cual en la creación de mensajes. Fallback al nombre en minúsculas si no hay id.
function toOptions(list) {
  return list.map((item) => ({
    name: catalogLabel(item.name),
    value: item.id && item.id !== '0' ? item.id : item.name.toLowerCase()
  }))
}

// Acepta el envelope paginado actual y el formato legado que envolvía la página en un arreglo.
export function unwrapPage(result) {
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
function rememberedApplicationId() {
  try {
    const context = JSON.parse(localStorage.getItem(CONTEXT_STORAGE_KEY) || 'null')
    return typeof context?.applicationId === 'string' ? context.applicationId : ''
  } catch {
    return ''
  }
}

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
    this.clearSession()
    return recoverUnauthorized()
  },

  clearSession() {
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
    { value: '6319ca87-47b3-4e0e-994f-3166378988f2', name: 'Inglés' },
    { value: 'bed4d574-4c7f-4d95-bc12-6dbbcdbbf4fc', name: 'Español' },
    { value: '8cc7ae54-db8c-4ef1-929b-22e17de58129', name: 'Francés' }
  ],
  applicationStates: [
    { value: 'dfb7a7cb-66f6-4b73-a1d8-803336f72ebe', name: 'Activo' },
    { value: '2a0ddacd-2dcc-47e2-b56f-03db5207c443', name: 'Inactivo' }
  ],
  functionalityStates: [
    { value: '407de974-c8aa-43e2-a5cf-22dc7c44054b', name: 'Activo' },
    { value: '505cde87-96f2-4926-8dc6-b04529469bd3', name: 'Inactivo' }
  ],

  // Lista de mensajes (página actual)
  messages: [],
  totalMessages: 0,
  totalPages: 1,
  messagesPage: 1,
  messagesSize: 20,
  messageSearch: '',
  messageTitleSearch: '',
  messagesSortColumn: 'code',
  messagesSortDirection: 'ASC',
  messageStatusFilter: '',
  functionalityFilter: '',
  messagesRequestVersion: 0,
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
    this.messageTitleSearch = ''
    this.messagesSortColumn = 'code'
    this.messagesSortDirection = 'ASC'
    this.messageStatusFilter = ''
    this.functionalityFilter = ''
    this.messagesRequestVersion += 1
    this.messagesLoading = false
  },

  async loadSessionApplications({ loadWorkspace = true } = {}) {
    if (!this.isAuthenticated) return
    this.contextsLoading = true
    this.contextsError = ''
    try {
      const user = await sessionApi.user()
      if (!this.isAuthenticated) return
      const [organizations, applications] = await Promise.all([
        workspaceApi.organizations(), sessionApi.applications()
      ])
      if (!this.isAuthenticated) return
      this.workspaceUser = unwrapList(user)[0] || null
      this.organizations = unwrapList(organizations)
      this.sessionApplications = unwrapList(applications)
      const registered = this.sessionApplications.filter((app) => app.registered)
      // Solo el id es una preferencia local: nombres, organizacion y propiedad vienen del servidor.
      const applicationId = this.activeContext?.applicationId || rememberedApplicationId()
      const current = registered.find((app) => app.id === applicationId)
      if (current) {
        await this.selectSessionApplication(current, { loadWorkspace })
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

  async selectSessionApplication(app, { loadWorkspace = true } = {}) {
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
      // En /seguridad se conserva el contexto del host sin cargar mensajes ni catalogos de negocio.
      if (!loadWorkspace) {
        this.resetMessages()
        return
      }
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
    await this.setMessageFilters({ environmentIds })
  },

  async setMessageFilters({ code = this.messageSearch, title = this.messageTitleSearch, statusId = this.messageStatusFilter,
    functionalityId = this.functionalityFilter, environmentIds = this.environmentFilter } = {}) {
    this.messageSearch = code
    this.messageTitleSearch = title
    this.messageStatusFilter = statusId
    this.functionalityFilter = functionalityId
    this.environmentFilter = [...environmentIds]
    await this.loadMessages(false, 1)
  },

  async toggleMessagesUpdatedAtSort() {
    this.messagesSortDirection = this.messagesSortColumn === 'updatedAt' && this.messagesSortDirection === 'DESC'
      ? 'ASC'
      : 'DESC'
    this.messagesSortColumn = 'updatedAt'
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
    const requestVersion = ++this.messagesRequestVersion
    const applicationId = this.activeContext?.applicationId
    this.messagesError = ''
    // Sin sesión y aplicación confirmadas no se consultan los recursos protegidos.
    if (!this.isAuthenticated || !applicationId) {
      this.messages = []
      this.messagesLoading = false
      return
    }
    if (!silent) this.messagesLoading = true
    try {
      const res = unwrapPage(await messageApi.list(page, this.messagesSize, this.environmentFilter, {
        code: this.messageSearch,
        title: this.messageTitleSearch,
        statusId: this.messageStatusFilter,
        functionalityId: this.functionalityFilter,
        sort: this.messagesSortDirection,
        columnSort: this.messagesSortColumn
      }))
      if (requestVersion !== this.messagesRequestVersion || applicationId !== this.activeContext?.applicationId) return
      this.messages = res.data || []
      this.totalMessages = res.totalItems ?? 0
      this.totalPages = res.totalPages ?? 0
      this.messagesPage = page
    } catch (e) {
      this.handleUnauthorized(e)
      if (requestVersion !== this.messagesRequestVersion) return
      this.messagesError = e.message
      this.messages = []
      this.totalMessages = 0
      this.totalPages = 0
    } finally {
      if (requestVersion === this.messagesRequestVersion) this.messagesLoading = false
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
      // Todos los refrescos conservan los filtros y los totales calculados por el servidor.
      const membershipChanged = event?.type === 'MessageDeleted'
        || (event?.type === 'MessageUpdated'
          && (this.messageStatusFilter || this.functionalityFilter || this.messageTitleSearch))
      const page = membershipChanged ? 1 : this.messagesPage
      await this.loadMessages(true, page)
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
    await Promise.all([this.loadCatalogs(silent), this.loadMessages(silent)])
  }
})
