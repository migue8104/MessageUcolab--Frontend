import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { URL } from 'node:url'

const componentUrl = new URL('../src/components/EditMessage.vue', import.meta.url)

async function createHarness({ message = sampleMessage(), environments = defaultEnvironments() } = {}) {
  const watchers = []
  let mounted
  let unmounted
  const calls = { functionalities: [], updates: [], emits: [] }
  const timers = { scheduled: [], cleared: [] }
  const context = vm.createContext({ setTimeout: (...args) => { const handle = globalThis.setTimeout(...args); timers.scheduled.push(handle); return handle }, clearTimeout: (handle) => { if (handle !== undefined) timers.cleared.push(handle); globalThis.clearTimeout(handle) }, testProps: { message }, testEmit: (name) => calls.emits.push(name) })
  const vue = new vm.SyntheticModule(['ref', 'reactive', 'computed', 'watch', 'onMounted', 'onBeforeUnmount'], function init() {
    this.setExport('ref', (initial) => {
      let value = initial
      return { get value() { return value }, set value(next) { value = next; for (const watcher of watchers) { const current = watcher.getter(); if (current !== watcher.old) { const old = watcher.old; watcher.old = current; watcher.callback(current, old) } } } }
    })
    this.setExport('reactive', (value) => value)
    this.setExport('computed', (definition) => typeof definition === 'function'
      ? { get value() { return definition() } }
      : { get value() { return definition.get() }, set value(value) { definition.set(value) } })
    this.setExport('watch', (source, callback, options = {}) => {
      const getter = typeof source === 'function' ? source : () => source.value
      const watcher = { getter, callback, old: getter() }
      watchers.push(watcher)
      if (options.immediate) callback(watcher.old, undefined)
    })
    this.setExport('onMounted', (callback) => { mounted = callback })
    this.setExport('onBeforeUnmount', (callback) => { unmounted = callback })
  }, { context })
  const state = {
    activeContext: { applicationId: 'app-1', applicationName: 'Application', organizationName: 'Organization' },
    environments, types: [], categories: [], states: [], catalogsLoading: false, catalogsError: '',
    unauthorized: [], handleUnauthorized(error) { this.unauthorized.push(error) }
  }
  const store = new Proxy(state, {
    set(target, key, value) {
      target[key] = value
      for (const watcher of watchers) {
        const next = watcher.getter()
        if (next !== watcher.old) { const old = watcher.old; watcher.old = next; watcher.callback(next, old) }
      }
      return true
    }
  })
  let functionalities = async () => [{ id: 'fn-1', name: 'Billing' }]
  let update = async () => {}
  const api = new vm.SyntheticModule(['catalogApi', 'messageApi'], function init() {
    this.setExport('catalogApi', { functionalities: (...args) => { calls.functionalities.push(args); return functionalities(...args) } })
    this.setExport('messageApi', { update: (...args) => { calls.updates.push(args); return update(...args) } })
  }, { context })
  const storeModule = new vm.SyntheticModule(['store'], function init() { this.setExport('store', store) }, { context })
  const formModule = new vm.SyntheticModule(['validateMessageFields'], function init() {
    this.setExport('validateMessageFields', (form) => form.title.trim().length >= 10 && form.content.trim().length >= 10 && form.typeId && form.categoryId && form.statusId && form.functionalityId ? '' : 'Campos inválidos')
  }, { context })
  const presentation = new vm.SyntheticModule(['catalogLabel', 'statusName', 'environmentTone'], function init() {
    this.setExport('catalogLabel', (value) => value?.name || '')
    this.setExport('statusName', (value) => value?.status?.name || '')
    this.setExport('environmentTone', () => '')
  }, { context })
  const component = new vm.SyntheticModule(['default'], function init() { this.setExport('default', {}) }, { context })
  const source = await readFile(componentUrl, 'utf8')
  let script = source.match(/<script setup>([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script, 'SFC debe contener script setup')
  script = script.replace(/const props = defineProps\([\s\S]*?\nconst emit = defineEmits\([^\n]+\)/, 'const props = globalThis.testProps\nconst emit = globalThis.testEmit')
  script += '\nexport { props, form, success, formError, saving, loadingFunctionalities, allEnvironments, addedEnvironments, removedEnvironments, environmentHint, updateMessage, environmentsChanged }\n'
  const module = new vm.SourceTextModule(script, { context })
  await module.link((specifier) => specifier === 'vue' ? vue : specifier === '../api' ? api : specifier === '../store' ? storeModule : specifier === '../messageForm' ? formModule : specifier === '../presentation' ? presentation : component)
  await module.evaluate()
  const ns = module.namespace
  return {
    ns, store, calls, timers,
    async mount() { await mounted() }, unmount() { unmounted() },
    setFunctionalities(fn) { functionalities = fn }, setUpdate(fn) { update = fn },
    setMessage(next) { context.testProps.message = next; for (const watcher of watchers) { const value = watcher.getter(); if (value !== watcher.old) { const old = watcher.old; watcher.old = value; watcher.callback(value, old) } } }
  }
}

function defaultEnvironments() { return [{ id: 'dev', name: 'Development' }, { id: 'qa', name: 'QA' }, { id: 'prod', name: 'Production' }] }
function sampleMessage() { return { code: 'MSG-1', title: 'Welcome message', content: 'Welcome to the application', typeId: 'type-1', categoryId: 'cat-1', statusId: 'active', functionalityId: 'fn-1', functionality: 'Billing', environments: [{ id: 'dev', name: 'Development' }] } }
function ready(h) { h.store.types = [{ value: 'type-1', name: 'Info' }]; h.store.categories = [{ value: 'cat-1', name: 'General' }]; h.store.states = [{ value: 'active', name: 'Active' }] }

test('hidrata IDs de mensaje, deduplica ambientes reales y no usa selección ni filtro predeterminado', async () => {
  const h = await createHarness({ message: { ...sampleMessage(), environments: [...sampleMessage().environments, { id: 'dev', name: 'Development' }] } })
  assert.deepEqual(Array.from(h.ns.form.environmentIds), ['dev'])
  assert.equal(h.ns.form.functionalityId, 'fn-1')
  assert.equal(h.ns.allEnvironments.value, false)
  assert.deepEqual(h.store.environmentFilter, undefined)
})

test('catálogos tardíos llenan campos vacíos y conservan selecciones manuales al refrescarse', async () => {
  const h = await createHarness()
  h.ns.form.typeId = 'manual'
  ready(h)
  assert.equal(h.ns.form.typeId, 'manual')
  assert.equal(h.ns.form.categoryId, 'cat-1')
  h.store.categories = [{ value: 'cat-2', name: 'New' }]
  assert.equal(h.ns.form.categoryId, 'cat-1')
})

test('catálogo de funcionalidades tardío resuelve por nombre y error se comunica a autorización', async () => {
  const h = await createHarness({ message: { ...sampleMessage(), functionalityId: '', functionality: 'Billing' } })
  h.setFunctionalities(async () => [{ id: 'fn-1', name: 'Billing' }])
  await h.mount()
  assert.deepEqual(h.calls.functionalities, [['app-1']])
  assert.equal(h.ns.form.functionalityId, 'fn-1')
  const failed = await createHarness()
  failed.setFunctionalities(async () => { throw Object.assign(new Error('denied'), { status: 401 }) })
  await failed.mount()
  assert.equal(failed.store.unauthorized.length, 1)
  assert.equal(failed.ns.formError.value, 'denied')
})

test('Todos refleja estado indeterminado y seleccionar o deseleccionar actualiza la colección', async () => {
  const h = await createHarness()
  assert.equal(h.ns.allEnvironments.value, false)
  h.ns.form.environmentIds.push('qa')
  assert.equal(h.ns.form.environmentIds.length > 0 && !h.ns.allEnvironments.value, true)
  h.ns.allEnvironments.value = true
  assert.deepEqual(Array.from(h.ns.form.environmentIds), ['dev', 'qa', 'prod'])
  h.ns.allEnvironments.value = false
  assert.deepEqual(Array.from(h.ns.form.environmentIds), [])
})

test('resumen distingue ambientes que se añaden y retiran sin persistir hasta guardar', async () => {
  const h = await createHarness()
  h.ns.form.environmentIds = ['qa']
  assert.deepEqual(h.ns.addedEnvironments.value.map((env) => env.id), ['qa'])
  assert.deepEqual(h.ns.removedEnvironments.value.map((env) => env.id), ['dev'])
  assert.equal(h.calls.updates.length, 0)
  assert.equal(h.ns.environmentHint(h.store.environments[1]), 'Se añadirá al guardar')
})

test('rechaza lista vacía e IDs ajenos, pero permite actualizar con copia de ambientes y código capturado', async () => {
  const h = await createHarness()
  ready(h)
  h.ns.form.environmentIds = []
  await h.ns.updateMessage()
  assert.equal(h.ns.formError.value, 'Selecciona al menos un ambiente para el mensaje.')
  h.ns.form.environmentIds = ['foreign']
  await h.ns.updateMessage()
  assert.match(h.ns.formError.value, /únicamente los disponibles/)
  h.ns.form.environmentIds = ['qa']
  await h.ns.updateMessage()
  assert.equal(h.calls.updates.length, 1)
  assert.equal(h.calls.updates[0][0], 'MSG-1')
  assert.deepEqual(Array.from(h.calls.updates[0][1].environmentIds), ['qa'])
  assert.equal(h.calls.updates[0][1].code, undefined)
  assert.equal(h.calls.updates[0][1].applicationId, undefined)
  assert.notEqual(h.calls.updates[0][1].environmentIds, h.ns.form.environmentIds)
})

test('cancelar no invoca API y bloqueo por carga o contexto impide escritura', async () => {
  const h = await createHarness()
  ready(h)
  h.calls.emits.push('cancel')
  assert.equal(h.calls.updates.length, 0)
  h.store.catalogsLoading = true
  await h.ns.updateMessage()
  h.store.catalogsLoading = false
  h.store.activeContext = { applicationId: 'app-2' }
  await h.ns.updateMessage()
  assert.equal(h.calls.updates.length, 0)
  assert.match(h.ns.formError.value, /cambió/)
})

test('doble envío se bloquea mientras guarda y respuesta exitosa emite actualización y programa cierre', async () => {
  const h = await createHarness()
  ready(h)
  let finish
  h.setUpdate(() => new Promise((resolve) => { finish = resolve }))
  const pending = h.ns.updateMessage()
  await Promise.resolve()
  await h.ns.updateMessage()
  assert.equal(h.calls.updates.length, 1)
  finish()
  await pending
  assert.deepEqual(h.calls.emits, ['updated'])
})

test('fallo de actualización se expone y un cambio de mensaje descarta resultado tardío', async () => {
  const h = await createHarness()
  ready(h)
  h.setUpdate(async () => { throw new Error('network') })
  await h.ns.updateMessage()
  assert.equal(h.ns.formError.value, 'network')
  let finish
  h.setUpdate(() => new Promise((resolve) => { finish = resolve }))
  const pending = h.ns.updateMessage()
  await Promise.resolve()
  h.setMessage({ ...sampleMessage(), code: 'MSG-2' })
  finish()
  await pending
  assert.deepEqual(h.calls.emits, [])
})

test('respuesta tardía tras cambiar aplicación o desmontar no publica éxito y desmontar limpia timer', async () => {
  const h = await createHarness()
  ready(h)
  let finish
  h.setUpdate(() => new Promise((resolve) => { finish = resolve }))
  const pending = h.ns.updateMessage()
  await Promise.resolve()
  h.store.activeContext = { applicationId: 'app-2' }
  finish()
  await pending
  assert.deepEqual(h.calls.emits, [])
  const unmounted = await createHarness()
  ready(unmounted)
  unmounted.setUpdate(async () => {})
  await unmounted.ns.updateMessage()
  unmounted.unmount()
  assert.deepEqual(unmounted.calls.emits, ['updated'])
  assert.equal(unmounted.timers.cleared.length, 1)
})
