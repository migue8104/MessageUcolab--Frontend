import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { URL } from 'node:url'

async function loadModules({ deleteApplication = async () => {}, applications = [] } = {}) {
  const calls = []
  const context = vm.createContext({ localStorage: {
    getItem: () => null,
    setItem() {},
    removeItem(key) { calls.push(['removeContext', key]) }
  }, clearTimeout() {}, setTimeout() { return 1 } })
  const reactive = new vm.SyntheticModule(['reactive'], function () {
    this.setExport('reactive', (value) => value)
  }, { context })
  const api = new vm.SyntheticModule(['catalogApi', 'messageApi', 'sessionApi', 'workspaceApi', 'setRequestContext'], function () {
    this.setExport('catalogApi', {})
    this.setExport('messageApi', { deleteApplication: async (id) => { calls.push(['delete', id]); return deleteApplication(id) } })
    this.setExport('sessionApi', {})
    this.setExport('workspaceApi', {})
    this.setExport('setRequestContext', () => {})
  }, { context })
  const session = new vm.SyntheticModule(['recoverUnauthorized'], function () {
    this.setExport('recoverUnauthorized', async () => {})
  }, { context })
  const presentation = new vm.SyntheticModule(['catalogLabel'], function () {
    this.setExport('catalogLabel', (value) => value)
  }, { context })
  const source = await readFile(new URL('../src/store.js', import.meta.url), 'utf8')
  const storeModule = new vm.SourceTextModule(source, { context, identifier: 'store.js' })
  await storeModule.link((specifier) => ({ vue: reactive, './api': api, './security/session': session, './presentation': presentation })[specifier])
  await storeModule.evaluate()
  const store = storeModule.namespace.store
  store.sessionApplications = applications
  store.organizationApplications = applications
  store.applications = applications
  return { store, calls }
}

test('store removes deleted application and clears selected context after confirmed response', async () => {
  const { store, calls } = await loadModules({ applications: [{ id: 'app-1' }, { id: 'app-2' }] })
  store.activeContext = { applicationId: 'app-1' }
  store.environments = [{ id: 'env-1' }]
  store.messages = [{ code: 'MSG_A' }]

  await store.deletePersonalApplication('app-1')

  assert.deepEqual(calls, [['delete', 'app-1'], ['removeContext', 'personalWorkspaceContext']])
  assert.deepEqual(Array.from(store.sessionApplications, app => app.id), ['app-2'])
  assert.deepEqual(Array.from(store.organizationApplications, app => app.id), ['app-2'])
  assert.deepEqual(Array.from(store.applications, app => app.id), ['app-2'])
  assert.equal(store.activeContext, null)
  assert.deepEqual(Array.from(store.environments), [])
  assert.deepEqual(Array.from(store.messages), [])
})

test('store preserves local state when deletion fails', async () => {
  const { store, calls } = await loadModules({ deleteApplication: async () => { throw new Error('denied') }, applications: [{ id: 'app-1' }] })
  store.activeContext = { applicationId: 'app-1' }

  await assert.rejects(store.deletePersonalApplication('app-1'), /denied/)

  assert.deepEqual(calls, [['delete', 'app-1']])
  assert.deepEqual(Array.from(store.sessionApplications, app => app.id), ['app-1'])
  assert.deepEqual(Array.from(store.organizationApplications, app => app.id), ['app-1'])
  assert.deepEqual(Array.from(store.applications, app => app.id), ['app-1'])
  assert.equal(store.activeContext.applicationId, 'app-1')
})
