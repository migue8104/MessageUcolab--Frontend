import { confirmProtectedAccess, recoverUnauthorized, sessionRecovery } from './security/session'

const API_ORIGIN = import.meta.env.VITE_API_URL?.replace(/\/+$/, '')
const API_PATH = '/messageucolab'
const BASE = import.meta.env.DEV
  ? API_PATH
  : API_ORIGIN
    ? `${API_ORIGIN}${API_PATH}`
    : API_PATH

class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request(path, { method = 'GET', body, base = BASE, includeEnvelope = false } = {}) {
  if (sessionRecovery.status !== 'idle') {
    throw new ApiError(sessionRecovery.message, { status: 401, code: 'SESSION_RECOVERY_REQUIRED' })
  }
  const headers = { Accept: 'application/json' }
  if (body) headers['Content-Type'] = 'application/json'

  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
    cache: 'no-store'
  })

  if (res.status === 401) {
    await recoverUnauthorized()
    // La navegación recarga las lecturas; nunca se repite aquí una mutación.
    throw new ApiError(sessionRecovery.message, { status: 401, code: 'SESSION_RECOVERY_REQUIRED' })
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
    throw new ApiError(firstError.message || res.statusText || `HTTP ${res.status}`, {
      status: res.status,
      code: firstError.code
    })
  }
  if (!res.ok) {
    // Conserva el detalle del PEP/PDP (por ejemplo TOKEN_INVALID) para mostrarlo al usuario.
    throw new ApiError(json?.detail || json?.message || res.statusText || `HTTP ${res.status}`, {
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
  environments: (appId) => request(`/v1/catalog/applications/${appId}/environments`),
  functionalities: (appId) => request(`/v1/catalog/applications/${appId}/functionalities`),
  messageTypes: () => request('/v1/catalog/message-types'),
  messageCategories: () => request('/v1/catalog/message-categories'),
  messageStates: () => request('/v1/catalog/message-states'),
  messageEnvironmentStates: () => request('/v1/catalog/message-environment-states')
}

export const workspaceApi = {
  local: () => request('/v1/workspace/local')
}

export const meApi = {
  contexts: () => request('/v1/me/contexts'),
  activeContext: () => request('/v1/me/context'),
  selectContext: (body) => request('/v1/me/context', { method: 'PUT', body })
}

export const messageApi = {
  create: (payload) =>
    request('/v1/messages', { method: 'POST', body: payload }),

  createApplication: (payload) =>
    request('/v1/application', { method: 'POST', body: payload }),

  createFunctionality: (payload) =>
    request('/v1/application/functionality', { method: 'POST', body: payload }),

  list: (page, size) =>
    request(`/v1/messages?page=${page}&size=${size}&sort=ASC&columnSort=code`, {
      includeEnvelope: true
    }),

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

  remove: (code) =>
    request(`/v1/messages/${encodeURIComponent(code)}`, {
      method: 'DELETE'
    })
}
