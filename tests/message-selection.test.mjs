import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { URL } from 'node:url'

const root = new URL('../src/', import.meta.url)

async function createHarness() {
  const watchers = []
  let unmount
  const vueContext = vm.createContext({})
  const vue = new vm.SyntheticModule(
    ['computed', 'onBeforeUnmount', 'ref', 'watch'],
    function initialize() {
      this.setExport('ref', (value) => ({ value }))
      this.setExport('computed', (getter) => ({ get value() { return getter() } }))
      this.setExport('watch', (source, callback) => {
        const getter = typeof source === 'function' ? source : () => source.value
        watchers.push({ getter, callback, old: getter() })
      })
      this.setExport('onBeforeUnmount', (callback) => { unmount = callback })
    },
    { context: vueContext }
  )
  const storeState = {
    activeContext: { applicationId: 'app-a', applicationName: 'Application A' },
    messageSearch: '', messageTitleSearch: '', messageStatusFilter: '', functionalityFilter: '',
    messagesSortDirection: 'ASC', messagesSortColumn: 'code', environmentFilter: ['dev'],
    messages: [], messagesLoading: false, messagesError: '', isAuthenticated: true,
    handleUnauthorized(error) { this.unauthorized.push(error) }, unauthorized: [],
    async loadMessages(silent, page) { this.loads.push([silent, page]) }, loads: []
  }
  const store = new Proxy(storeState, {
    set(target, property, value) {
      target[property] = value
      for (const watcher of watchers) {
        const next = watcher.getter()
        if (next !== watcher.old) {
          const old = watcher.old
          watcher.old = next
          watcher.callback(next, old)
        }
      }
      return true
    }
  })
  const calls = { lists: [], removes: [] }
  let list = async () => ({ data: [], totalItems: 0, totalPages: 1 })
  let remove = async () => {}
  const api = new vm.SyntheticModule(['messageApi'], function initialize() {
    this.setExport('messageApi', {
      list: (...args) => { calls.lists.push(args); return list(...args) },
      remove: (...args) => { calls.removes.push(args); return remove(...args) }
    })
  }, { context: vueContext })
  const storeModule = new vm.SyntheticModule(['store', 'unwrapPage'], function initialize() {
    this.setExport('store', store)
    this.setExport('unwrapPage', (page) => page?.data && Array.isArray(page.data) ? page : { data: page?.data || [], totalItems: page?.totalItems || 0, totalPages: page?.totalPages || 0 })
  }, { context: vueContext })
  const source = await readFile(new URL('messageSelection.js', root), 'utf8')
  const module = new vm.SourceTextModule(source, { context: vueContext })
  await module.link((specifier) => specifier === 'vue' ? vue : specifier === './api' ? api : storeModule)
  await module.evaluate()
  const selection = module.namespace.useMessageSelection()
  return {
    selection, store, calls,
    setList(fn) { list = fn }, setRemove(fn) { remove = fn },
    unmount() { unmount?.() }
  }
}

test('individual and page selection retain selections across pages and expose indeterminate state', async () => {
  const { selection, store } = await createHarness()
  store.messages = [{ code: 'A' }, { code: 'B' }]
  selection.toggleMessage('A', true)
  assert.equal(selection.someOnPage.value, true)
  selection.togglePage(true)
  assert.equal(selection.allOnPage.value, true)
  store.messages = [{ code: 'C' }]
  assert.equal(selection.selectedCount.value, 2)
  selection.toggleMessage('C', true)
  assert.equal(selection.selectedCount.value, 3)
})

test('selects all filtered results across pages with captured app and query', async () => {
  const { selection, store, calls, setList } = await createHarness()
  store.messageSearch = 'WELCOME'
  store.environmentFilter = ['dev', 'qa']
  const pages = [
    { data: [{ code: 'A' }, { code: 'B' }], totalItems: 3, totalPages: 2 },
    { data: [{ code: 'C' }], totalItems: 3, totalPages: 2 }
  ]
  setList(async (page) => pages[page - 1])
  await selection.selectAllResults()
  assert.deepEqual([...selection.selectedCodes.value], ['A', 'B', 'C'])
  assert.equal(selection.selectedCount.value, 3)
  assert.deepEqual(calls.lists.map(([page, size, env, query]) => [page, size, [...env], query.applicationId, query.code]), [
    [1, 50, ['dev', 'qa'], 'app-a', 'WELCOME'], [2, 50, ['dev', 'qa'], 'app-a', 'WELCOME']
  ])
})

test('query changes clear selection and pending confirmation', async () => {
  const { selection, store } = await createHarness()
  store.messages = [{ code: 'A' }]
  selection.toggleMessage('A', true)
  selection.requestDelete()
  assert.ok(selection.pendingDelete.value)
  store.messageStatusFilter = 'active'
  assert.equal(selection.selectedCount.value, 0)
  assert.equal(selection.pendingDelete.value, null)
})

test('confirmation can be cancelled and delete uses immutable codes and captured application', async () => {
  const { selection, store, calls } = await createHarness()
  selection.toggleMessage('A', true)
  selection.toggleMessage('B', true)
  selection.requestDelete()
  selection.closeDelete()
  await selection.deleteMessages()
  assert.equal(calls.removes.length, 0)

  selection.requestDelete(['A', 'B'])
  await selection.deleteMessages()
  assert.deepEqual(calls.removes, [['A', 'app-a'], ['B', 'app-a']])
  assert.deepEqual(store.loads, [[false, 1]])
})

test('successful deletion removes only completed codes and refreshes server totals', async () => {
  const { selection, store, calls, setRemove } = await createHarness()
  selection.toggleMessage('A', true)
  selection.toggleMessage('B', true)
  selection.requestDelete()
  setRemove(async () => {})
  await selection.deleteMessages()
  assert.equal(calls.removes.length, 2)
  assert.equal(selection.selectedCount.value, 0)
  assert.deepEqual(store.loads, [[false, 1]])
  assert.match(selection.notice.value, /2 de 2/)
})

for (const status of [undefined, 401, 403, 429, 500, 503]) {
  test(`stops sequential deletion after uncertain error ${status ?? 'network'} without retry`, async () => {
    const { selection, calls, setRemove } = await createHarness()
    for (const code of ['A', 'B', 'C']) selection.toggleMessage(code, true)
    selection.requestDelete()
    setRemove(async () => { throw Object.assign(new Error('failure'), status ? { status } : {}) })
    await selection.deleteMessages()
    assert.deepEqual(calls.removes, [['A', 'app-a']])
    assert.equal(selection.selectedCount.value, 3)
    assert.match(selection.error.value, /siguen seleccionados/)
  })
}

test('partial deletion retains failed and unattempted codes', async () => {
  const { selection, calls, setRemove } = await createHarness()
  for (const code of ['A', 'B', 'C']) selection.toggleMessage(code, true)
  selection.requestDelete()
  setRemove(async (code) => { if (code === 'B') throw Object.assign(new Error('conflict'), { status: 409 }) })
  await selection.deleteMessages()
  assert.deepEqual(calls.removes, [['A', 'app-a'], ['B', 'app-a'], ['C', 'app-a']])
  assert.deepEqual([...selection.selectedCodes.value], ['B'])
  assert.match(selection.notice.value, /2 de 3/)
  assert.match(selection.error.value, /1 mensajes/)
})

test('application change invalidates confirmation and prevents further delete requests', async () => {
  const { selection, store, calls, setRemove } = await createHarness()
  selection.requestDelete(['A', 'B'])
  setRemove(async () => { store.activeContext = { applicationId: 'app-b', applicationName: 'Application B' } })
  await selection.deleteMessages()
  assert.deepEqual(calls.removes, [['A', 'app-a']])
  assert.equal(store.loads.length, 0)
})

test('application change during paged selection discards the response and stops pagination', async () => {
  const { selection, store, calls, setList } = await createHarness()
  let complete
  setList(() => new Promise((resolve) => { complete = resolve }))
  const selecting = selection.selectAllResults()
  store.activeContext = { applicationId: 'app-b', applicationName: 'Application B' }
  complete({ data: [{ code: 'STALE' }], totalItems: 51, totalPages: 2 })
  await selecting
  assert.equal(calls.lists.length, 1)
  assert.equal(selection.selectedCount.value, 0)
})

test('unmount during an in-flight delete prevents subsequent mutations', async () => {
  const { selection, calls, setRemove, unmount } = await createHarness()
  selection.requestDelete(['A', 'B'])
  let complete
  setRemove(() => new Promise((resolve) => { complete = resolve }))
  const deleting = selection.deleteMessages()
  await Promise.resolve()
  unmount()
  complete()
  await deleting
  assert.deepEqual(calls.removes, [['A', 'app-a']])
})

test('unmount during result fetch abandons selection without publishing stale results', async () => {
  const { selection, calls, setList, unmount } = await createHarness()
  let complete
  setList(() => new Promise((resolve) => { complete = resolve }))
  const selecting = selection.selectAllResults()
  unmount()
  complete({ data: [{ code: 'STALE' }], totalItems: 1, totalPages: 1 })
  await selecting
  assert.equal(selection.selectedCount.value, 0)
  assert.equal(calls.lists.length, 1)
})
