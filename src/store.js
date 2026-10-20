import { reactive } from 'vue'
import { catalogApi, messageApi, meApi, toMessageCode } from './api'
import { requireSession } from './security/session'

let sessionValidation = null

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

const storedContext = (() => {
  try {
    return JSON.parse(localStorage.getItem('activeContext') || 'null')
  } catch {
    return null
  }
})()

// Estado global compartido entre todos los componentes (reactivo).
export const store = reactive({
  isAuthenticated: false,
  setSession() {
    this.isAuthenticated = true
  },

  // Contexto activo del usuario (organización/aplicación/ambiente)
  contexts: [],
  activeContext: storedContext,
  contextsLoading: false,
  contextsError: '',

  handleUnauthorized(error) {
    if (error.status !== 401 && error.code !== 'UNAUTHORIZED') return

    if (!sessionValidation) {
      const currentStore = this
      sessionValidation = requireSession()
        .then((session) => {
          if (session) return

          currentStore.isAuthenticated = false
          currentStore.activeContext = null
          currentStore.contexts = []
          currentStore.contextsError = error.message
          localStorage.removeItem('activeContext')
        })
        .catch((sessionError) => {
          console.error('No fue posible revalidar la sesión.', sessionError)
        })
        .finally(() => {
          sessionValidation = null
        })
    }

    return sessionValidation
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

  async loadContexts(silent = false) {
    if (!this.isAuthenticated) return
    if (!silent) this.contextsLoading = true
    this.contextsError = ''
    try {
      const data = await meApi.contexts()
      this.contexts = Array.isArray(data) ? data : data && data.data ? data.data : []
      // Si solo había un contexto y no hay uno activo, se selecciona automáticamente
      if (!this.activeContext && this.contexts.length === 1) {
        await this.selectContext(this.contexts[0])
      }
    } catch (e) {
      this.handleUnauthorized(e)
      this.contextsError = e.message
    } finally {
      this.contextsLoading = false
    }
  },

  async selectContext(ctx) {
    this.contextsError = ''
    try {
      // El backend espera { organizationId, applicationId, environmentId }
      const result = await meApi.selectContext(
        {
          organizationId: ctx.organization?.id || ctx.organizationId || '',
          applicationId: ctx.application?.id || ctx.applicationId || '',
          environmentId: ctx.environment?.id || ctx.environmentId || ''
        }
      )
      // Mantiene los nombres para mostrarlos y agrega los ids devueltos por el backend
      const ids = Array.isArray(result) ? result[0] || {} : result || {}
      this.activeContext = { ...ctx, ...ids }
      localStorage.setItem('activeContext', JSON.stringify(this.activeContext))
      this.messages = []
      this.totalMessages = 0
      this.totalPages = 0
      this.messagesPage = 1
      this.messageSearch = ''
      await Promise.all([this.loadMessages(false, 1), this.loadCatalogs()])
    } catch (e) {
      this.handleUnauthorized(e)
      this.contextsError = e.message
      throw e
    }
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
      const res = unwrapPage(await messageApi.list(page, this.messagesSize))
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

  async setMessagesPage(page) {
    if (page < 1 || page > this.totalPages || page === this.messagesPage) return
    this.messagesPage = page
    await this.loadMessages(false, page)
  },

  async refresh(silent = true) {
    // Los contextos NO se consultan aquí: solo cambian al autenticar o
    // al entrar al selector, evitando peticiones extra al backend.
    this.messageSearch = ''
    await Promise.all([this.loadCatalogs(silent), this.loadMessages(silent)])
  }
})

// Helper para mostrar el nombre de un contexto
export function contextLabel(ctx) {
  if (!ctx) return ''
  const org = (ctx.organization && (ctx.organization.name || ctx.organization)) || ctx.organizationName || ''
  const app = (ctx.application && (ctx.application.name || ctx.application)) || ctx.applicationName || ''
  const env = (ctx.environment && (ctx.environment.name || ctx.environment)) || ctx.environmentName || ''
  return [org, app, env].filter(Boolean).join(' / ')
}
