import { confirmProtectedAccess, recoverUnauthorized, sessionRecovery } from './security/session'

const API_ORIGIN = import.meta.env.VITE_API_URL?.replace(/\/+$/, '')
const API_PATH = '/messageucolab'
const BASE = import.meta.env.DEV
  ? API_PATH
  : API_ORIGIN
    ? `${API_ORIGIN}${API_PATH}`
    : API_PATH

const GENERIC_SERVER_ERROR = 'Ocurri? un error inesperado. Intenta de nuevo m?s tarde.'

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
    let decoded = text
    // Reparar tildes si llegan mal (?, ?, ?, ?, ?, ?)
    if (decoded.includes('\uFFFD') || /[????????????]/.test(decoded) === false && /[AEIOUNaeioun]/.test(decoded.replace(/[\w\s.,:;()\[\]{}"'!?-]/g,'')) === false) {
      // intento suave: no forzamos latin1 si ya hay acentos
    }
    // Forzar decodificaci?n correcta desde bytes si viene mal
    try {
      const bytes = new Uint8Array([...decoded].map(c => c.charCodeAt(0)))
      // mejor: intentar detectar
    } catch {}
    // Simple fix: si hay �, intentar interpretar como ISO-8859-1
    if (decoded.includes('�')) {
      try {
        const buf = new TextEncoder().encode(decoded)
        // no exacto; alternativa: usar Blob
      } catch {}
      try {
        decoded = new TextDecoder('iso-8859-1').decode(Buffer.from(decoded, 'binary'))
      } catch {}
    }
    try {
      json = JSON.parse(decoded)
    } catch {
      if (res.ok) {
        throw new ApiError('La respuesta del servidor no tiene un formato v?lido.', {
          status: res.status
        })
      }
    }
  }

  const firstError = Array.isArray(json?.errors) ? json.errors[0] : null
  if (firstError) {
    throw new ApiError(
      res.status === 500
        ? firstError.message || GENERIC_SERVER_ERROR
        : firstError.message || res.statusText,
      { status: res.status, code: firstError.code }
    )
  }
  if (!res.ok) {
    throw new ApiError(
      res.status === 500 ? GENERIC_SERVER_ERROR : json?.detail || json?.message || res.statusText || `HTTP ${res.status}`,
      { status: res.status, code: json?.code }
    )
  }

  if (method === 'GET') confirmProtectedAccess()
  return includeEnvelope ? json : json?.data ?? null
}

// Normaliza el c?digo de mensaje: el backend solo acepta el sufijo
// (m?x. 10, patr?n ^[A-Za-z0-9 ]+$) y lo guarda como MSG_<sufijo>.
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
    })
}
