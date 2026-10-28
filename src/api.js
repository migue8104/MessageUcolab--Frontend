import { confirmProtectedAccess, recoverUnauthorized, sessionRecovery } from './security/session'
import { environmentName } from './presentation'

const API_ORIGIN = import.meta.env.VITE_API_URL?.replace(/\/+$/, '')
const API_PATH = '/messageucolab'
const BASE = import.meta.env.DEV
  ? API_PATH
  : API_ORIGIN
    ? `${API_ORIGIN}${API_PATH}`
    : API_PATH

// Aplicación elegida; el backend siempre la valida contra la sesión.
// El ambiente no es parte del contexto: es un dato de cada mensaje.
const requestContext = { applicationId: '' }

export function setRequestContext({ applicationId = '' } = {}) {
  requestContext.applicationId = applicationId
}

export function contextHeaders() {
  const headers = {}
  if (requestContext.applicationId) headers['X-Application-Id'] = requestContext.applicationId
  return headers
}

class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function httpErrorMessage(status) {
  const messages = {
    400: 'La solicitud no es válida.', 401: 'Debes iniciar sesión para continuar.',
    403: 'No tienes permiso para realizar esta operación.', 404: 'No se encontró el recurso solicitado.',
    405: 'Esta operación no está permitida para el recurso.', 406: 'El formato solicitado no está disponible.',
    409: 'La operación entra en conflicto con los datos actuales.', 413: 'El archivo supera el tamaño permitido.',
    415: 'El formato enviado no está admitido.', 422: 'Revisa los datos enviados antes de continuar.',
    429: 'Hay demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    500: 'Ocurrió un error interno al procesar la solicitud.', 502: 'No fue posible comunicarse con el servicio.',
    503: 'El servicio no está disponible en este momento.', 504: 'El servicio tardó demasiado en responder.'
  }
  return messages[status] || `No se pudo completar la solicitud (HTTP ${status}).`
}

function serverErrorMessage(message, status, code) {
  if (code === 'TOKEN_INVALID') return 'La credencial de acceso no es válida. Inicia sesión nuevamente.'
  const standardMessages = ['Unauthorized', 'Forbidden', 'Access Denied', 'Not Found', 'Bad Request',
    'Internal Server Error', 'Service Unavailable', 'Not Acceptable', 'Unsupported Media Type']
  return !message || standardMessages.includes(message) ? httpErrorMessage(status) : message
}

async function request(path, { method = 'GET', body, base = BASE, includeEnvelope = false, download = false, applicationId = requestContext.applicationId } = {}) {
  if (sessionRecovery.status !== 'idle') {
    throw new ApiError(sessionRecovery.message, { status: 401, code: 'SESSION_RECOVERY_REQUIRED' })
  }
  const multipart = body instanceof FormData
  const headers = { Accept: download ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json' : 'application/json' }
  if (applicationId) headers['X-Application-Id'] = applicationId
  if (body && !multipart) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(base + path, {
      method,
      headers,
      body: body ? multipart ? body : JSON.stringify(body) : undefined,
      credentials: 'include',
      cache: 'no-store'
    })
  } catch {
    throw new ApiError('No fue posible conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.')
  }

  if (res.status === 401) {
    await recoverUnauthorized()
    // La navegación recarga las lecturas; nunca se repite aquí una mutación.
    throw new ApiError(sessionRecovery.message, { status: 401, code: 'SESSION_RECOVERY_REQUIRED' })
  }

  if (download && res.ok) {
    confirmProtectedAccess()
    return res.blob()
  }
  const text = await res.text()
  let json = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      if (res.ok) {
        throw new ApiError('La respuesta del servidor no tiene un formato válido.', { status: res.status })
      }
    }
  }

  const firstError = Array.isArray(json?.errors) ? json.errors[0] : null
  if (firstError) {
    throw new ApiError(serverErrorMessage(firstError.message, res.status, firstError.code), {
      status: res.status,
      code: firstError.code
    })
  }
  if (!res.ok) {
    // Conserva el detalle del PEP/PDP (por ejemplo TOKEN_INVALID) para mostrarlo al usuario.
    throw new ApiError(serverErrorMessage(json?.detail || json?.message, res.status, json?.code), {
      status: res.status,
      code: json?.code
    })
  }

  if (method === 'GET') confirmProtectedAccess()
  return includeEnvelope ? json : json?.data ?? null
}

// Normaliza el código de mensaje: el backend solo acepta el sufijo
// (máx. 10, patrón ^[A-Za-z0-9 ]+$) y lo guarda como MSG_<sufijo>.
export function toMessageCode(raw) {
  const value = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/^MSG_+/, '')
  return value ? `MSG_${value}` : ''
}

export const catalogApi = {
  applications: () => request('/v1/catalog/applications'),
  environments: async (appId) => {
    const result = await request(`/v1/catalog/applications/${appId}/environments`)
    return Array.isArray(result) ? result.map((env) => ({ ...env, name: environmentName(env.name) })) : result
  },
  functionalities: (appId) => request(`/v1/catalog/applications/${appId}/functionalities`),
  messageTypes: () => request('/v1/catalog/message-types'),
  messageCategories: () => request('/v1/catalog/message-categories'),
  messageStates: () => request('/v1/catalog/message-states'),
  messageEnvironmentStates: () => request('/v1/catalog/message-environment-states')
}

export const sessionApi = {
  user: () => request('/v1/session/user'),
  applications: () => request('/v1/session/applications')
}

export const workspaceApi = {
  organizations: () => request('/v1/organizations'),
  createOrganization: (name) => request('/v1/organizations', { method: 'POST', body: { name } }),
  applications: (organizationId) =>
    request(`/v1/organizations/${encodeURIComponent(organizationId)}/applications`)
}

export const messageImportApi = {
  template: () => request('/v1/messages/imports/template', { download: true }),
  validate: (file, environmentIds) => {
    const body = new FormData()
    body.append('file', file)
    const query = new URLSearchParams({ environmentIds: environmentIds.join(',') })
    return request(`/v1/messages/imports/validate?${query}`, { method: 'POST', body })
  },
  preview: (id) => request(`/v1/messages/imports/${encodeURIComponent(id)}`),
  result: (id) => request(`/v1/messages/imports/${encodeURIComponent(id)}/result`),
  report: (id) => request(`/v1/messages/imports/${encodeURIComponent(id)}/errors`, { download: true }),
  confirm: (id, productionConfirmed) => request(`/v1/messages/imports/${encodeURIComponent(id)}/confirm`, {
    method: 'POST', body: { productionConfirmed }
  })
}

export const messageApi = {
  create: (payload) =>
    request('/v1/messages', { method: 'POST', body: payload }),

  createApplication: (payload) =>
    request('/v1/application', { method: 'POST', body: payload }),

  createFunctionality: (payload) =>
    request('/v1/application/functionality', { method: 'POST', body: payload }),

  list: (page, size, environmentIds = [], {
    code = '', title = '', statusId = '', functionalityId = '', sort = 'ASC', columnSort = 'code', applicationId
  } = {}) => {
    const query = new URLSearchParams({ page, size, sort, columnSort })
    if (environmentIds.length) query.set('filterEnvironments', environmentIds.join(','))
    if (code) query.set('filterCode', code)
    if (title) query.set('filterTitle', title)
    if (statusId) query.set('filterStatusId', statusId)
    if (functionalityId) query.set('filterFunctionalityId', functionalityId)
    return request(`/v1/messages?${query}`, {
      includeEnvelope: true,
      applicationId
    })
  },

  byCode: (code) =>
    request(`/v1/messages?code=${encodeURIComponent(code)}`),

  translate: (code, targetLanguage, sourceLanguage = 'auto') =>
    request(`/v1/messages/${encodeURIComponent(code)}/translations`, {
      method: 'POST',
      body: { sourceLanguage, targetLanguage }
    }),

  // Sin token: la sesión BFF viaja en la cookie (credentials: 'include').
  update: (code, payload) =>
    request(`/v1/messages/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: payload
    }),

  updateEnvironments: (code, environmentIds, applicationId) =>
    request(`/v1/messages/${encodeURIComponent(code)}`, {
      method: 'PUT',
      applicationId,
      body: { environmentsOnly: true, environmentIds: [...environmentIds] }
    }),

  remove: (code, applicationId) =>
    request(`/v1/messages/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      applicationId
    })
}
