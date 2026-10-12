import { reactive } from 'vue'
import { catalogApi, messageApi, meApi } from './api'

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

// El token se obtiene automáticamente (modo simulado del backend): el usuario
// no genera tokens, solo elige el contexto de trabajo.
export const AUTO_TOKEN = 'simulated-access-token'

const initialToken = AUTO_TOKEN

// Estado global compartido entre todos los componentes (reactivo).
export const store = reactive({
  token: initialToken,
  setToken(value) {
    const token = typeof value === 'string' ? value.trim() : ''
    this.token = token
    if (token) {
      localStorage.setItem('token', token)
      this.activeContext = null
      this.contexts = []
      localStorage.removeItem('activeContext')
    } else {
      localStorage.removeItem('token')
      localStorage.removeItem('activeContext')
      this.activeContext = null
      this.contexts = []
      return
    }
    // Al autenticar, los contextos se cargan una sola vez (no en el polling)
    this.loadContexts(true)
  },

  // Contexto activo del usuario (organización/aplicación/ambiente)
  contexts: [],
  activeContext: storedContext,
  contextsLoading: false,
  contextsError: '',

  handleUnauthorized(error) {
    if (error.status !== 401 && error.code !== 'UNAUTHORIZED') return
    this.activeContext = null
    this.contexts = []
    this.contextsError = error.message
    localStorage.removeItem('activeContext')
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
  messagesLoading: false,
  messagesError: '',

  async loadContexts(silent = false) {
    if (!this.token) return
    if (!silent) this.contextsLoading = true
    this.contextsError = ''
    try {
      const data = await meApi.contexts(this.token)
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
        },
        this.token
      )
      // Mantiene los nombres para mostrarlos y agrega los ids devueltos por el backend
      const ids = Array.isArray(result) ? result[0] || {} : result || {}
      this.activeContext = { ...ctx, ...ids }
      localStorage.setItem('activeContext', JSON.stringify(this.activeContext))
      this.messages = []
      this.totalMessages = 0
      this.totalPages = 0
      this.messagesPage = 1
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
        catalogApi.applications(this.token),
        catalogApi.messageTypes(this.token),
        catalogApi.messageCategories(this.token),
        catalogApi.messageStates(this.token)
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
    // Sin token no tiene sentido consultar: el backend exige autenticación.
    if (!this.token) {
      this.messages = []
      this.messagesLoading = false
      return
    }
    if (!silent) this.messagesLoading = true
    try {
      const res = unwrapPage(await messageApi.list(page, this.messagesSize, this.token))
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

  async setMessagesPage(page) {
    if (page < 1 || page > this.totalPages || page === this.messagesPage) return
    this.messagesPage = page
    await this.loadMessages(false, page)
  },

  async refresh(silent = true) {
    // Los contextos NO se consultan aquí: solo cambian al autenticar o
    // al entrar al selector, evitando peticiones extra al backend.
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