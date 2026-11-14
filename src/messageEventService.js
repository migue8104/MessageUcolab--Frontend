import { contextHeaders, messageEventsUrl } from './api'

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

export function createMessageEventService({ onEvent, onStatus, onUnauthorized } = {}) {
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

  async function consume(response, connection) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (!stopped && controller === connection) {
        const { value, done } = await reader.read()
        if (done || stopped || controller !== connection) break
        // Preserve a trailing CR until the next chunk, which may start with its LF.
        buffer = (buffer + decoder.decode(value, { stream: true }))
          .replace(/\r\n/g, '\n').replace(/\r(?!$)/g, '\n')

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
    const connection = new AbortController()
    controller = connection
    status('connecting')
    let shouldReconnect = true

    try {
      const response = await fetch(messageEventsUrl(), {
        headers: {
          Accept: 'text/event-stream',
          ...contextHeaders()
        },
        credentials: 'include',
        cache: 'no-store',
        signal: connection.signal
      })

      if (stopped || connection.signal.aborted || controller !== connection) return

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          status(response.status === 403 ? 'forbidden' : 'unauthorized')
          shouldReconnect = false
          if (response.status === 401 && onUnauthorized) onUnauthorized()
          return
        }
        throw new Error(`La solicitud de eventos falló con el estado HTTP ${response.status}.`)
      }
      const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
      if (contentType !== 'text/event-stream') throw new Error('El servidor no abrió un canal de eventos SSE.')
      if (!response.body) throw new Error('La respuesta de eventos no tiene un contenido legible.')

      reconnectAttempt = 0
      status('connected')
      if (onEvent) onEvent({ event: 'connected', id: '', data: null })
      await consume(response, connection)
    } catch (error) {
      if (!stopped && controller === connection && error.name !== 'AbortError') status('error')
    } finally {
      if (controller === connection) {
        controller = null
        if (!stopped && shouldReconnect) scheduleReconnect()
      }
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
