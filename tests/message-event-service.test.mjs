import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { URL } from 'node:url'

const serviceUrl = new URL('../src/messageEventService.js', import.meta.url)

function controlledTimers() {
  let id = 0
  const pending = new Map()
  return {
    setTimeout(callback, delay) { const timerId = ++id; pending.set(timerId, { callback, delay }); return timerId },
    clearTimeout(timerId) { pending.delete(timerId) },
    runNext() {
      const [timerId, timer] = pending.entries().next().value || []
      if (timerId === undefined) throw new Error('No hay reconexión pendiente')
      pending.delete(timerId)
      timer.callback()
      return timer.delay
    },
    get pendingCount() { return pending.size }
  }
}

function deferred() {
  let resolve
  const promise = new Promise((complete) => { resolve = complete })
  return { promise, resolve }
}

async function flushMicrotasks() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

async function loadService(fetchImpl, timers = { setTimeout, clearTimeout }) {
  const context = vm.createContext({
    fetch: fetchImpl, AbortController, TextDecoder,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout
  })
  const api = new vm.SyntheticModule(['contextHeaders', 'messageEventsUrl'], function initialize() {
    this.setExport('contextHeaders', () => ({ 'X-Application-Id': 'app-a' }))
    this.setExport('messageEventsUrl', () => '/messageucolab/v1/messages/events')
  }, { context })
  const module = new vm.SourceTextModule(await readFile(serviceUrl, 'utf8'), { context })
  await module.link(() => api)
  await module.evaluate()
  return module.namespace.createMessageEventService
}

function response(status, body, contentType = 'text/event-stream') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name === 'content-type' ? contentType : null },
    body
  }
}

test('message event service normalizes CRLF split across chunks and emits SSE data', async () => {
  let release
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: MessagesChanged\r'))
      controller.enqueue(new TextEncoder().encode('\ndata: {"applicationId":"app-a"}\r\n\r'))
      controller.enqueue(new TextEncoder().encode('\n'))
      release = () => controller.close()
    }
  })
  const received = []
  let eventReceived
  const parsedEvent = new Promise((resolve) => { eventReceived = resolve })
  const createService = await loadService(async () => response(200, body))
  const service = createService({ onEvent: (event) => {
    received.push(event)
    if (event.event === 'MessagesChanged') eventReceived()
  } })

  service.start()
  await parsedEvent
  assert.equal(received[0].event, 'connected')
  assert.equal(received[1].event, 'MessagesChanged')
  assert.equal(received[1].data.applicationId, 'app-a')
  service.stop()
  release()
})

test('403 sets forbidden terminal status without unauthorized callback or reconnect', async () => {
  let calls = 0
  const statuses = []
  let unauthorizedCalls = 0
  const createService = await loadService(async () => {
    calls += 1
    return response(403, null)
  })
  const service = createService({
    onStatus: (status) => statuses.push(status),
    onUnauthorized: () => { unauthorizedCalls += 1 }
  })

  service.start()
  await flushMicrotasks()
  service.stop()

  assert.equal(calls, 1)
  assert.ok(statuses.includes('forbidden'))
  assert.equal(unauthorizedCalls, 0)
})

test('HTTP 200 HTML is rejected as SSE and enters reconnect state', async () => {
  const statuses = []
  const createService = await loadService(async () => response(200, new ReadableStream(), 'text/html'))
  const service = createService({ onStatus: (status) => statuses.push(status) })

  service.start()
  await flushMicrotasks()
  service.stop()

  assert.ok(statuses.includes('error'))
  assert.ok(statuses.includes('reconnecting'))
})

test('late fetch response after stop/start cannot alter the replacement connection', async () => {
  const timers = controlledTimers()
  const firstFetch = deferred()
  const statuses = []
  const events = []
  let calls = 0
  const secondBody = new ReadableStream({ start(controller) { controller.close() } })
  const createService = await loadService(() => {
    calls += 1
    return calls === 1 ? firstFetch.promise : Promise.resolve(response(200, secondBody))
  }, timers)
  const service = createService({ onStatus: (status) => statuses.push(status), onEvent: (event) => events.push(event) })

  service.start()
  service.stop()
  service.start()
  await flushMicrotasks()
  const currentEvents = events.length
  const currentStatuses = [...statuses]
  firstFetch.resolve(response(200, new ReadableStream()))
  await flushMicrotasks()

  assert.equal(calls, 2)
  assert.equal(events.length, currentEvents)
  assert.deepEqual(statuses, currentStatuses)
  service.stop()
})

test('pending old reader is ignored after stop/start while the new stream stays active', async () => {
  const timers = controlledTimers()
  const oldRead = deferred()
  const newRead = deferred()
  const events = []
  const statuses = []
  let calls = 0
  const bodyWithPendingRead = (read) => ({
    getReader: () => ({ read: () => read.promise, releaseLock() {} })
  })
  const createService = await loadService(async () => {
    calls += 1
    return response(200, bodyWithPendingRead(calls === 1 ? oldRead : newRead))
  }, timers)
  const service = createService({ onEvent: (event) => events.push(event), onStatus: (status) => statuses.push(status) })

  service.start()
  await flushMicrotasks()
  service.stop()
  service.start()
  await flushMicrotasks()
  assert.equal(events.filter(({ event }) => event === 'connected').length, 2)
  const eventsAfterRestart = events.length
  const statusesAfterRestart = [...statuses]

  oldRead.resolve({ value: new TextEncoder().encode('event: stale\ndata: {}\n\n'), done: false })
  await flushMicrotasks()
  assert.equal(events.length, eventsAfterRestart)
  assert.deepEqual(statuses, statusesAfterRestart)

  service.stop()
  newRead.resolve({ done: true })
})

test('cut connection reconnects with controlled backoff and emits connected again', async () => {
  const timers = controlledTimers()
  const events = []
  const statuses = []
  let calls = 0
  const firstBody = new ReadableStream({ start(controller) { controller.close() } })
  const secondBody = new ReadableStream({ start(controller) { controller.close() } })
  const createService = await loadService(async () => {
    calls += 1
    return response(200, calls === 1 ? firstBody : secondBody)
  }, timers)
  const service = createService({ onEvent: (event) => events.push(event), onStatus: (status) => statuses.push(status) })

  service.start()
  await flushMicrotasks()
  assert.equal(timers.pendingCount, 1)
  assert.equal(timers.runNext(), 1000)
  await flushMicrotasks()

  assert.equal(calls, 2)
  assert.equal(events.filter(({ event }) => event === 'connected').length, 2)
  assert.equal(statuses.filter((status) => status === 'connected').length, 2)
  service.stop()
})
