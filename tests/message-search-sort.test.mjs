import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { URL, URLSearchParams } from 'node:url'
import { clearTimeout, setTimeout } from 'node:timers'
import { reactive } from 'vue'

const root = new URL('../src/', import.meta.url)

async function loadStore(fetchImpl) {
  const context = vm.createContext({
    fetch: fetchImpl,
    URLSearchParams,
    localStorage: { setItem() {}, removeItem() {} },
    setTimeout,
    clearTimeout,
  })
  const vue = new vm.SyntheticModule(['reactive'], function initialize() {
    this.setExport('reactive', reactive)
  }, { context })
  const session = new vm.SyntheticModule(
    ['confirmProtectedAccess', 'recoverUnauthorized', 'sessionRecovery'],
    function initialize() {
      this.setExport('confirmProtectedAccess', () => {})
      this.setExport('recoverUnauthorized', async () => {})
      this.setExport('sessionRecovery', { status: 'idle', message: '' })
    }, { context }
  )
  const apiSource = await readFile(new URL('api.js', root), 'utf8')
  const api = new vm.SourceTextModule(apiSource, {
    context,
    identifier: 'api.js',
    initializeImportMeta(meta) { meta.env = { DEV: true, VITE_API_URL: '' } }
  })
  await api.link(async (specifier) => specifier === 'vue' ? vue : session)
  await api.evaluate()
  const storeSource = await readFile(new URL('store.js', root), 'utf8')
  const storeModule = new vm.SourceTextModule(storeSource, { context, identifier: 'store.js' })
  await storeModule.link(async (specifier) => {
    if (specifier === 'vue') return vue
    if (specifier === './api') return api
    return session
  })
  await storeModule.evaluate()
  return { store: storeModule.namespace.store, api: api.namespace }
}

function successfulResponse(data = { data: [], totalItems: 0, totalPages: 1 }) {
  return { status: 200, ok: true, text: async () => JSON.stringify(data) }
}

test('messageApi.list sends title and code together with filters and server sort', async () => {
  const requests = []
  const { api } = await loadStore(async (url, options) => {
    requests.push({ url, options })
    return successfulResponse()
  })

  await api.messageApi.list(2, 10, ['env-a'], {
    code: 'MSG_ABC', title: 'welcome', statusId: 'status-a',
    functionalityId: 'function-a', sort: 'DESC', columnSort: 'updatedAt'
  })

  const query = new URL(requests[0].url, 'http://localhost').searchParams
  assert.deepEqual(Object.fromEntries(query), {
    page: '2', size: '10', sort: 'DESC', columnSort: 'updatedAt',
    filterEnvironments: 'env-a', filterCode: 'MSG_ABC', filterTitle: 'welcome',
    filterStatusId: 'status-a', filterFunctionalityId: 'function-a'
  })
})

test('store toggles updatedAt DESC then ASC, resets page, and retains filters on pagination and refresh', async () => {
  const requests = []
  const { store } = await loadStore(async (url) => {
    requests.push(new URL(url, 'http://localhost'))
    return successfulResponse({ data: [], totalItems: 31, totalPages: 4 })
  })
  store.isAuthenticated = true
  store.activeContext = { applicationId: 'app-a' }
  store.messagesPage = 3
  store.messageSearch = 'MSG_ABC'
  store.messageTitleSearch = 'Welcome'
  store.messageStatusFilter = 'status-a'
  store.functionalityFilter = 'function-a'
  store.environmentFilter = ['env-a']

  await store.toggleMessagesUpdatedAtSort()
  assert.equal(requests[0].searchParams.get('sort'), 'DESC')
  assert.equal(requests[0].searchParams.get('columnSort'), 'updatedAt')
  assert.equal(requests[0].searchParams.get('page'), '1')
  await store.toggleMessagesUpdatedAtSort()
  assert.equal(requests[1].searchParams.get('sort'), 'ASC')
  await store.setMessagesPage(2)
  await store.refreshMessagesFromEvent()

  for (const request of requests.slice(2)) {
    assert.equal(request.searchParams.get('filterTitle'), 'Welcome')
    assert.equal(request.searchParams.get('filterCode'), 'MSG_ABC')
    assert.equal(request.searchParams.get('filterStatusId'), 'status-a')
    assert.equal(request.searchParams.get('filterFunctionalityId'), 'function-a')
    assert.equal(request.searchParams.get('filterEnvironments'), 'env-a')
    assert.equal(request.searchParams.get('columnSort'), 'updatedAt')
  }
  assert.equal(requests[2].searchParams.get('page'), '2')
  assert.equal(requests[3].searchParams.get('page'), '2')
})

test('setMessageFilters preserves omitted title and resetMessages clears title and restores default ordering', async () => {
  const requests = []
  const { store } = await loadStore(async (url) => {
    requests.push(new URL(url, 'http://localhost'))
    return successfulResponse()
  })
  store.isAuthenticated = true
  store.activeContext = { applicationId: 'app-a' }
  store.messageTitleSearch = 'Welcome'
  store.messageSearch = 'MSG_A'
  store.messagesSortColumn = 'updatedAt'
  store.messagesSortDirection = 'DESC'

  await store.setMessageFilters({ statusId: 'status-a' })
  assert.equal(requests[0].searchParams.get('filterTitle'), 'Welcome')
  assert.equal(requests[0].searchParams.get('filterStatusId'), 'status-a')
  assert.equal(requests[0].searchParams.get('page'), '1')

  store.resetMessages()
  assert.equal(store.messageTitleSearch, '')
  assert.equal(store.messagesSortColumn, 'code')
  assert.equal(store.messagesSortDirection, 'ASC')
})

test('outdated message response cannot replace current page result', async () => {
  const pending = []
  const { store } = await loadStore(() => new Promise((resolve) => pending.push(resolve)))
  store.isAuthenticated = true
  store.activeContext = { applicationId: 'app-a' }

  const oldRequest = store.loadMessages(false, 1)
  const currentRequest = store.loadMessages(false, 2)
  pending[1](successfulResponse({ data: [{ code: 'CURRENT' }], totalItems: 1, totalPages: 1 }))
  await currentRequest
  pending[0](successfulResponse({ data: [{ code: 'STALE' }], totalItems: 9, totalPages: 9 }))
  await oldRequest

  assert.deepEqual(Array.from(store.messages, ({ code }) => code), ['CURRENT'])
  assert.equal(store.totalMessages, 1)
  assert.equal(store.messagesPage, 2)
})
