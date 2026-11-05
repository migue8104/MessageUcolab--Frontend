import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { URL } from 'node:url'
import { validateMessageFields } from '../src/messageForm.js'

const componentUrl = new URL('../src/components/CreateMessage.vue', import.meta.url)

async function createHarness() {
  const calls = { creates: [], emits: [], unauthorized: [] }
  const context = vm.createContext({ testEmit: (...args) => calls.emits.push(args), setTimeout: () => 1, clearTimeout() {} })
  const vue = new vm.SyntheticModule(['ref', 'reactive', 'watch', 'onMounted', 'computed', 'onBeforeUnmount'], function init() {
    this.setExport('ref', (value) => ({ value }))
    this.setExport('reactive', (value) => value)
    this.setExport('watch', (_source, callback, options = {}) => { if (options.immediate) callback() })
    this.setExport('onMounted', () => {})
    this.setExport('onBeforeUnmount', () => {})
    this.setExport('computed', (definition) => typeof definition === 'function'
      ? { get value() { return definition() } }
      : { get value() { return definition.get() }, set value(value) { definition.set(value) } })
  }, { context })
  const store = {
    activeContext: { applicationId: 'app-1', applicationName: 'App', organizationName: 'Org' },
    environments: [{ id: 'dev', name: 'Develop' }], types: [{ value: 'type-1' }], categories: [{ value: 'category-1' }],
    states: [{ value: 'status-1' }],
    handleUnauthorized(error) { calls.unauthorized.push(error) }
  }
  const api = new vm.SyntheticModule(['catalogApi', 'messageApi', 'toMessageCode'], function init() {
    this.setExport('catalogApi', { functionalities: async () => [{ id: 'fn-1', active: true }] })
    this.setExport('messageApi', { create: async (...args) => { calls.creates.push(args); return { id: 'new' } } })
    this.setExport('toMessageCode', (code) => `MSG_${code}`)
  }, { context })
  const storeModule = new vm.SyntheticModule(['store'], function init() { this.setExport('store', store) }, { context })
  const formModule = new vm.SyntheticModule(['validateMessageFields'], function init() {
    this.setExport('validateMessageFields', validateMessageFields)
  }, { context })
  const presentation = new vm.SyntheticModule(['environmentTone'], function init() { this.setExport('environmentTone', () => '') }, { context })
  const component = new vm.SyntheticModule(['default'], function init() { this.setExport('default', {}) }, { context })
  let source = await readFile(componentUrl, 'utf8')
  source = source.match(/<script setup>([\s\S]*?)<\/script>/)?.[1]
  assert.ok(source, 'CreateMessage.vue must contain script setup')
  source = source.replace("const emit = defineEmits(['created', 'cancel'])", 'const emit = globalThis.testEmit')
  source += '\nexport { form, createMessage, codeInput, formError, success, functionalities }\n'
  const module = new vm.SourceTextModule(source, { context })
  await module.link((specifier) => specifier === 'vue' ? vue : specifier === '../api' ? api
    : specifier === '../store' ? storeModule : specifier === '../messageForm' ? formModule
      : specifier === '../presentation' ? presentation : component)
  await module.evaluate()
  module.namespace.functionalities.value = [{ id: 'fn-1', active: true }]
  return { ns: module.namespace, calls }
}

function fill(h, { code = 'WELCOME', title = 't'.repeat(10), content = 'c'.repeat(10) } = {}) {
  h.ns.success.value = ''
  Object.assign(h.ns.form, { code, title, content, typeId: 'type-1', categoryId: 'category-1', statusId: 'status-1', functionalityId: 'fn-1', environmentIds: ['dev'] })
}

test('CreateMessage.vue submits a normalized valid payload and rejects invalid boundary values without API writes', async () => {
  const h = await createHarness()
  fill(h, { code: 'A', title: 't'.repeat(10), content: 'c'.repeat(10) })
  await h.ns.createMessage()
  assert.equal(h.calls.creates.length, 1)
  assert.equal(h.calls.creates[0][0].code, 'A')
  assert.equal(h.calls.creates[0][0].title.length, 10)
  assert.equal(h.calls.creates[0][0].content.length, 10)

  for (const fields of [
    { code: 'A'.repeat(51) }, { title: '' }, { title: 't'.repeat(9) }, { title: 't'.repeat(201) },
    { content: '' }, { content: 'c'.repeat(9) }, { content: 'c'.repeat(501) }
  ]) {
    fill(h, fields)
    await h.ns.createMessage()
    assert.equal(h.calls.creates.length, 1)
    assert.notEqual(h.ns.formError.value, '')
  }

  fill(h, { code: 'A'.repeat(50), title: 't'.repeat(200), content: 'c'.repeat(500) })
  await h.ns.createMessage()
  assert.equal(h.calls.creates.length, 2)
  assert.equal(h.calls.creates[1][0].code, 'A'.repeat(50))
  assert.equal(h.calls.creates[1][0].title.length, 200)
  assert.equal(h.calls.creates[1][0].content.length, 500)
})

test('CreateMessage.vue strips a pasted MSG_ prefix using its real computed input setter', async () => {
  const h = await createHarness()
  h.ns.codeInput.value = `MSG_${'A'.repeat(50)}`
  fill(h, { code: h.ns.codeInput.value, title: 't'.repeat(200), content: 'c'.repeat(500) })
  await h.ns.createMessage()
  assert.equal(h.calls.creates.length, 1)
  assert.equal(h.calls.creates[0][0].code, 'A'.repeat(50))
})
