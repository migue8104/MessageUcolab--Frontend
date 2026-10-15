const BASE = '/messageucolab'

class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request(path, { method = 'GET', body, token, base = BASE, includeEnvelope = false } = {}) {
  const headers = { Accept: 'application/json' }
  if (body) headers['Content-Type'] = 'application/json'
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

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
    throw new ApiError(res.statusText || `HTTP ${res.status}`, { status: res.status })
  }

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
  applications: (token) => request('/v1/catalog/applications', { token }),
  environments: (appId, token) => request(`/v1/catalog/applications/${appId}/environments`, { token }),
  functionalities: (appId, token) => request(`/v1/catalog/applications/${appId}/functionalities`, { token }),
  messageTypes: (token) => request('/v1/catalog/message-types', { token }),
  messageCategories: (token) => request('/v1/catalog/message-categories', { token }),
  messageStates: (token) => request('/v1/catalog/message-states', { token }),
  messageEnvironmentStates: (token) => request('/v1/catalog/message-environment-states', { token })
}

export const meApi = {
  contexts: (token) => request('/v1/me/contexts', { token }),
  activeContext: (token) => request('/v1/me/context', { token }),
  selectContext: (body, token) => request('/v1/me/context', { method: 'PUT', body, token })
}

export const messageApi = {
  create: (payload, token) =>
    request('/v1/messages', { method: 'POST', body: payload, token }),

  createApplication: (payload, token) =>
    request('/v1/application', { method: 'POST', body: payload, token }),

  createFunctionality: (payload, token) =>
    request('/v1/application/functionality', { method: 'POST', body: payload, token }),

  list: (page, size, token) =>
    request(`/v1/messages?page=${page}&size=${size}&sort=ASC&columnSort=code`, {
      token,
      includeEnvelope: true
    }),

  byCode: (code, token) =>
    request(`/v1/messages?code=${encodeURIComponent(code)}`, { token }),

  translate: (code, targetLanguage, token, sourceLanguage = 'auto') =>
    request(`/v1/messages/${encodeURIComponent(code)}/translations`, {
      method: 'POST',
      body: { sourceLanguage, targetLanguage },
      token
    }),

  update: (code, payload, token) =>
    request(`/v1/messages/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: payload,
      token
    }),

  remove: (code, token) =>
    request(`/v1/messages/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      token
    })
}
