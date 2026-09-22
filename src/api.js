const BASE = '/messageucolab'

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' }
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers['Token'] = token

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  let json = null
  try {
    json = await res.json()
  } catch (_) {
    // la respuesta no es JSON
  }

  // SIEMPRE revisar errors, no confiar solo en el HTTP status
  if (json && Array.isArray(json.errors) && json.errors.length > 0) {
    throw new Error(json.errors.join(' · '))
  }
  if (!res.ok) {
    const msg = json ? JSON.stringify(json) : res.statusText
    throw new Error(`HTTP ${res.status}: ${msg}`)
  }

  return json ? json.data : null
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

export const messageApi = {
  generateToken: (applicationId, body) =>
    request(`/v1/application/${applicationId}/token`, { method: 'POST', body }),

  create: (payload, token) =>
    request('/v1/application/message', { method: 'POST', body: payload, token }),

  createApplication: (payload, token) =>
    request('/v1/application', { method: 'POST', body: payload, token }),

  createEnvironment: (payload, token) =>
    request('/v1/application/environment', { method: 'POST', body: payload, token }),

  createFunctionality: (payload, token) =>
    request('/v1/application/functionality', { method: 'POST', body: payload, token }),

  list: (page, size, environmentId) => {
    const env = environmentId ? `&environmentId=${encodeURIComponent(environmentId)}` : ''
    return request(`/v1/application/messages?page=${page}&size=${size}&sort=asc&columnSort=code${env}`)
  },

  byCode: (code, token) =>
    request(`/v1/application/messages/${encodeURIComponent(code)}`, { token }),

  translate: (code, targetLanguage, token) =>
    request(`/v1/application/messages/${encodeURIComponent(code)}/translation?sourceLanguage=auto&targetLanguage=${encodeURIComponent(targetLanguage)}`, { token })
}
