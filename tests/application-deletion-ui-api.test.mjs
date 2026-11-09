import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { URL } from 'node:url'

async function loadApi(fetchImpl) {
  const context = vm.createContext({ fetch: fetchImpl, URLSearchParams, FormData: globalThis.FormData })
  const session = new vm.SyntheticModule(['confirmProtectedAccess', 'recoverUnauthorized', 'sessionRecovery'], function () {
    this.setExport('confirmProtectedAccess', () => {})
    this.setExport('recoverUnauthorized', async () => {})
    this.setExport('sessionRecovery', { status: 'idle', message: '' })
  }, { context })
  const presentation = new vm.SyntheticModule(['environmentName'], function () { this.setExport('environmentName', name => name) }, { context })
  const source = await readFile(new URL('../src/api.js', import.meta.url), 'utf8')
  const module = new vm.SourceTextModule(source, { context, initializeImportMeta(meta) { meta.env = { DEV: true, VITE_API_URL: '' } } })
  await module.link(specifier => specifier === './security/session' ? session : presentation)
  await module.evaluate()
  return module.namespace
}

test('deleteApplication sends one credentialed DELETE to encoded route with selected app header and no body', async () => {
  const requests = []
  const api = await loadApi(async (url, options) => {
    requests.push({ url, options })
    return { status: 204, ok: true, text: async () => '' }
  })

  await api.messageApi.deleteApplication('app/id')

  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/messageucolab/v1/application/app%2Fid')
  assert.equal(requests[0].options.method, 'DELETE')
  assert.equal(requests[0].options.credentials, 'include')
  assert.equal(requests[0].options.body, undefined)
  assert.equal(requests[0].options.headers['X-Application-Id'], 'app/id')
})

async function loadComponent(deleteApplication) {
  const calls = { deletes: [], selected: null }
  const context = vm.createContext({ defineEmits: () => () => {}, clearTimeout() {}, setTimeout: () => 1 })
  const vue = new vm.SyntheticModule(['computed', 'reactive', 'ref', 'watch'], function () {
    this.setExport('ref', value => ({ value }))
    this.setExport('reactive', value => value)
    this.setExport('watch', (_source, callback, options = {}) => { if (options.immediate) callback([]) })
    this.setExport('computed', getter => ({ get value() { return getter() } }))
  }, { context })
  const store = {
    activeOrganization: { id: 'org-1' }, contextsLoading: false, contextsError: '',
    languages: [{ value: 'language' }], applicationStates: [{ value: 'state' }],
    sessionApplications: [{ id: 'app-1' }], organizationApplications: [{ id: 'app-1' }], applications: [],
    handleUnauthorized() {},
    async deletePersonalApplication(id) { calls.deletes.push(id); await deleteApplication(id); this.organizationApplications = [] }
  }
  const storeModule = new vm.SyntheticModule(['store'], function () { this.setExport('store', store) }, { context })
  const apiModule = new vm.SyntheticModule(['catalogApi'], function () { this.setExport('catalogApi', { environments: async () => [] }) }, { context })
  const presentation = new vm.SyntheticModule(['asList', 'catalogLabel'], function () {
    this.setExport('asList', x => x)
    this.setExport('catalogLabel', x => x)
  }, { context })
  const stubs = new vm.SyntheticModule(['default'], function () { this.setExport('default', {}) }, { context })
  const componentUrl = new URL('../src/components/SessionApplicationSelect.vue', import.meta.url)
  let script = (await readFile(componentUrl, 'utf8')).match(/<script setup>([\s\S]*?)<\/script>/)?.[1]
  script = script.replace("const emit = defineEmits(['selected'])", "const emit = (...args) => { calls.selected = args }")
  script += '\nexport { busy, error, modal, pendingDelete, deleteName, deleteConfirmed, canDelete, notice, requestDelete, closeDelete, deleteApplication }\n'
  const component = new vm.SourceTextModule(script, { context })
  await component.link(specifier => ({ vue, '../store': storeModule, '../api': apiModule, '../presentation': presentation,
    './ui/AppModal.vue': stubs, './ui/AppIcon.vue': stubs, './ui/PageHeader.vue': stubs,
    './ui/EmptyState.vue': stubs, './ui/EnvironmentBadge.vue': stubs })[specifier])
  await component.evaluate()
  return { ns: component.namespace, store, calls }
}

test('delete modal cancellation never sends request; exact name and confirmation are both required', async () => {
  const h = await loadComponent(async () => {})
  h.ns.requestDelete({ id: 'app-1', name: 'Workspace', organizationId: 'org-1' })
  assert.equal(h.ns.canDelete.value, false)
  h.ns.deleteName.value = 'workspace'
  h.ns.deleteConfirmed.value = true
  assert.equal(h.ns.canDelete.value, false)
  h.ns.deleteName.value = 'Workspace'
  assert.equal(h.ns.canDelete.value, true)
  h.ns.closeDelete()
  assert.equal(h.ns.pendingDelete.value, null)
  assert.deepEqual(h.calls.deletes, [])
})

test('modal disables duplicate submission while busy and retains confirmation on failure', async () => {
  let release
  const h = await loadComponent(() => new Promise((resolve, reject) => { release = () => reject(new Error('server failure')) }))
  h.ns.requestDelete({ id: 'app-1', name: 'Workspace', organizationId: 'org-1' })
  h.ns.deleteName.value = 'Workspace'
  h.ns.deleteConfirmed.value = true
  const pending = h.ns.deleteApplication()
  assert.equal(h.ns.busy.value, true)
  await h.ns.deleteApplication()
  assert.deepEqual(h.calls.deletes, ['app-1'])
  release()
  await pending
  assert.equal(h.ns.busy.value, false)
  assert.equal(h.ns.pendingDelete.value.id, 'app-1')
  assert.equal(h.ns.deleteConfirmed.value, true)
  assert.equal(h.ns.error.value, 'server failure')
})

test('successful modal deletion closes confirmation and publishes success notice', async () => {
  const h = await loadComponent(async () => {})
  h.ns.requestDelete({ id: 'app-1', name: 'Workspace', organizationId: 'org-1' })
  h.ns.deleteName.value = 'Workspace'
  h.ns.deleteConfirmed.value = true
  await h.ns.deleteApplication()
  assert.deepEqual(h.calls.deletes, ['app-1'])
  assert.equal(h.ns.pendingDelete.value, null)
  assert.match(h.ns.notice.value, /Workspace/)
})
