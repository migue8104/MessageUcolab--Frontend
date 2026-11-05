import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { URL } from 'node:url'

async function loadStore() {
  const tracker = { cancelled: [], saved: null, removed: '', recoverCalls: 0 }
  const context = vm.createContext({ clearTimeout(id) { tracker.cancelled.push(id) }, setTimeout() { return 1 },
    localStorage: { setItem(key, value) { tracker.saved = [key, value] }, removeItem(key) { tracker.removed = key } } })
  const reactive = new vm.SyntheticModule(['reactive'], function () { this.setExport('reactive', (value) => value) }, { context })
  const apiSource = await readFile(new URL('../src/api.js', import.meta.url), 'utf8')
  const api = new vm.SourceTextModule(apiSource, { context, identifier: 'api.js', initializeImportMeta(meta) { meta.env = { DEV: true, VITE_API_URL: '' } } })
  const session = new vm.SyntheticModule(['recoverUnauthorized', 'confirmProtectedAccess', 'sessionRecovery'], function () {
    this.setExport('recoverUnauthorized', async () => { tracker.recoverCalls++ })
    this.setExport('confirmProtectedAccess', () => {})
    this.setExport('sessionRecovery', { status: 'idle' })
  }, { context })
  const presentation = new vm.SyntheticModule(['catalogLabel', 'environmentName'], function () {
    this.setExport('catalogLabel', (name) => name)
    this.setExport('environmentName', (name) => name)
  }, { context })
  await api.link((specifier) => specifier === './security/session' ? session : presentation)
  await api.evaluate()
  const storeSource = await readFile(new URL('../src/store.js', import.meta.url), 'utf8')
  const storeModule = new vm.SourceTextModule(storeSource, { context, identifier: 'store.js' })
  await storeModule.link((specifier) => specifier === 'vue' ? reactive : specifier === './api' ? api : specifier === './security/session' ? session : presentation)
  await storeModule.evaluate()
  return { store: storeModule.namespace.store, tracker, api: api.namespace }
}

test('clearSession clears account, workspace, catalogs, request context, message state and scheduled refresh', async () => {
  const { store, tracker, api } = await loadStore()
  api.setRequestContext({ applicationId: 'app-1' })
  assert.deepEqual({ ...api.contextHeaders() }, { 'X-Application-Id': 'app-1' })
  store.isAuthenticated = true
  store.activeContext = { applicationId: 'app-1' }
  store.workspaceUser = { email: 'person@example.test' }
  store.organizations = [{ id: 'org' }]
  store.activeOrganization = { id: 'org' }
  store.organizationApplications = [{ id: 'app' }]
  store.sessionApplications = [{ id: 'app' }]
  store.applications = [{ id: 'catalog' }]
  store.types = [{ id: 'type' }]
  store.categories = [{ id: 'category' }]
  store.states = [{ id: 'state' }]
  store.environments = [{ id: 'env' }]
  store.environmentFilter = ['env']
  store.messages = [{ code: 'MSG' }]
  store.totalMessages = 8
  store.totalPages = 4
  store.messagesPage = 3
  store.messageSearch = 'MSG'
  store.messageTitleSearch = 'title'
  store.messagesSortColumn = 'updatedAt'
  store.messagesSortDirection = 'DESC'
  store.messageRefreshTimer = 77
  store.messageRefreshPending = { type: 'MessageUpdated' }

  store.clearSession()

  assert.equal(store.isAuthenticated, false)
  assert.equal(store.workspaceUser, null)
  assert.deepEqual(Array.from(store.organizations), [])
  assert.equal(store.activeOrganization, null)
  assert.deepEqual(Array.from(store.organizationApplications), [])
  assert.deepEqual(Array.from(store.sessionApplications), [])
  assert.deepEqual(Array.from(store.applications), [])
  assert.deepEqual(Array.from(store.types), [])
  assert.deepEqual(Array.from(store.categories), [])
  assert.deepEqual(Array.from(store.states), [])
  assert.equal(store.activeContext, null)
  assert.deepEqual(Array.from(store.environments), [])
  assert.deepEqual(Array.from(store.environmentFilter), [])
  assert.deepEqual(Array.from(store.messages), [])
  assert.equal(store.totalMessages, 0)
  assert.equal(store.totalPages, 0)
  assert.equal(store.messagesPage, 1)
  assert.equal(store.messageSearch, '')
  assert.equal(store.messageTitleSearch, '')
  assert.equal(store.messagesSortColumn, 'code')
  assert.equal(store.messagesSortDirection, 'ASC')
  assert.equal(store.messageRefreshTimer, null)
  assert.equal(store.messageRefreshPending, null)
  assert.deepEqual(tracker.cancelled, [77])
  assert.equal(tracker.removed, 'personalWorkspaceContext')
  assert.deepEqual({ ...api.contextHeaders() }, {})
})

test('handleUnauthorized clears and recovers only for HTTP 401 or UNAUTHORIZED code', async () => {
  const { store, tracker } = await loadStore()
  let clearCalls = 0
  const clearSession = store.clearSession.bind(store)
  store.clearSession = () => { clearCalls++; clearSession() }
  store.isAuthenticated = true
  store.workspaceUser = { name: 'User' }
  const other = store.handleUnauthorized({ status: 403 })
  assert.equal(other, undefined)
  assert.equal(store.isAuthenticated, true)
  assert.equal(tracker.recoverCalls, 0)
  assert.equal(clearCalls, 0)

  await store.handleUnauthorized({ status: 401 })
  assert.equal(store.isAuthenticated, false)
  assert.equal(store.workspaceUser, null)
  assert.equal(tracker.recoverCalls, 1)
  assert.equal(clearCalls, 1)

  store.isAuthenticated = true
  await store.handleUnauthorized({ code: 'UNAUTHORIZED' })
  assert.equal(store.isAuthenticated, false)
  assert.equal(tracker.recoverCalls, 2)
  assert.equal(clearCalls, 2)
})
