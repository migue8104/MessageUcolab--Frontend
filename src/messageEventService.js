const EVENTS_PATH = '/messageucolab/v1/messages/events'
const MAX_RECONNECT_DELAY = 30_000

function parseEvent(block) {
  let event = 'message'
  let id = ''
  const data = []

  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    const value = separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '')

    if (field === 'event') event = value
    if (field === 'id') id = value
    if (field === 'data') data.push(value)
  }

  if (!data.length) return null

  let payload = data.join('\n')
  try {
    payload = JSON.parse(payload)
  } catch {
    // SSE data is allowed to be plain text.
  }

  return { event, id, data: payload }
}

export function createMessageEventService({ getToken, onEvent, onStatus } = {}) {
  let controller = null
  let reconnectTimer = null
  let stopped = true
  let reconnectAttempt = 0

  function status(value) {
    if (onStatus) onStatus(value)
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return
    const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY)
    reconnectAttempt += 1
    status('reconnecting')
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  async function consume(response) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (!stopped) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n').replace(/\r/g, '\n')

        let separator = buffer.indexOf('\n\n')
        while (separator !== -1) {
          const block = buffer.slice(0, separator)
          buffer = buffer.slice(separator + 2)
          const parsed = parseEvent(block)
          if (parsed && onEvent) onEvent(parsed)
          separator = buffer.indexOf('\n\n')
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async function connect() {
    if (stopped || controller) return
    const token = getToken ? getToken() : ''
    if (!token) {
      status('disabled')
      return
    }

    controller = new AbortController()
    status('connecting')
    let shouldReconnect = true

    try {
      const response = await fetch(EVENTS_PATH, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
        signal: controller.signal
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          status('unauthorized')
          shouldReconnect = false
          return
        }
        throw new Error(`SSE request failed with HTTP ${response.status}`)
      }
      if (!response.body) throw new Error('SSE response has no readable body')

      reconnectAttempt = 0
      status('connected')
      if (onEvent) onEvent({ event: 'connected', id: '', data: null })
      await consume(response)
    } catch (error) {
      if (!stopped && error.name !== 'AbortError') status('error')
    } finally {
      controller = null
      if (!stopped && shouldReconnect) scheduleReconnect()
    }
  }

  return {
    start() {
      if (!stopped) return
      stopped = false
      reconnectAttempt = 0
      connect()
    },
    stop() {
      stopped = true
      clearReconnectTimer()
      if (controller) controller.abort()
      controller = null
      status('disconnected')
    }
  }
}
