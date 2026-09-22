import { reactive } from 'vue'
import { catalogApi, messageApi } from './api'

// Los catálogos de mensaje devuelven ids en cero; se usan las claves derivadas de name.toLowerCase()
function toOptions(list) {
  return list.map((item) => ({ name: item.name, value: item.name.toLowerCase() }))
}

// El backend devuelve el paginado dentro de un arreglo: data: [ { data: [...], totalItems, totalPages, ... } ]
function unwrapPage(result) {
  if (Array.isArray(result)) result = result[0] || {}
  return result || {}
}

// Estado global compartido entre todos los componentes (reactivo).
// Los catálogos y los mensajes viven aquí para que cualquier cambio
// se refleje al instante en toda la interfaz sin recargar el navegador.
export const store = reactive({
  token: localStorage.getItem('token') || '',
  setToken(value) {
    this.token = value
    localStorage.setItem('token', value)
  },

  // Catálogos globales (compartidos entre pestañas)
  applications: [],
  types: [],
  categories: [],
  states: [],
  envStates: [],
  catalogsLoading: false,
  catalogsError: '',

  // Opciones fijas para catálogos sin endpoint dedicado (según la base SurrealDB)
  languages: [
    { value: 'en', name: 'English' },
    { value: 'es', name: 'Spanish' },
    { value: 'fr', name: 'French' }
  ],
  applicationStates: [
    { value: 'active', name: 'Active' },
    { value: 'inactive', name: 'Inactive' }
  ],
  environmentTypes: [
    { value: 'develop', name: 'Develop' },
    { value: 'production', name: 'Production' },
    { value: 'testing', name: 'Testing' }
  ],
  environmentStates: [
    { value: 'active', name: 'Active' },
    { value: 'inactive', name: 'Inactive' }
  ],
  functionalityStates: [
    { value: 'active', name: 'Active' },
    { value: 'inactive', name: 'Inactive' }
  ],

  // Lista de mensajes (compartida entre pestañas)
  messages: [],
  totalMessages: 0,
  messagesLoading: false,
  messagesError: '',

  async loadCatalogs(silent = false) {
    if (!silent) this.catalogsLoading = true
    this.catalogsError = ''
    try {
      const [apps, types, cats, sts, evSts] = await Promise.all([
        catalogApi.applications(),
        catalogApi.messageTypes(),
        catalogApi.messageCategories(),
        catalogApi.messageStates(),
        catalogApi.messageEnvironmentStates()
      ])
      this.applications = apps
      this.types = toOptions(types)
      this.categories = toOptions(cats)
      this.states = toOptions(sts)
      this.envStates = toOptions(evSts)
    } catch (e) {
      this.catalogsError = e.message
    } finally {
      this.catalogsLoading = false
    }
  },

  async loadMessages(silent = false) {
    if (!silent) this.messagesLoading = true
    this.messagesError = ''
    try {
      const SIZE = 50
      const firstPage = unwrapPage(await messageApi.list(1, SIZE))
      const totalPages = firstPage.totalPages || 1
      this.totalMessages = firstPage.totalItems || 0

      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) => messageApi.list(i + 2, SIZE))
      )

      this.messages = [
        ...(firstPage.data || []),
        ...rest.flatMap((d) => unwrapPage(d).data || [])
      ]
    } catch (e) {
      this.messagesError = e.message
      this.messages = []
    } finally {
      this.messagesLoading = false
    }
  },

  async refresh(silent = true) {
    await Promise.all([this.loadCatalogs(silent), this.loadMessages(silent)])
  }
})