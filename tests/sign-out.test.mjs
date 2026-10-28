import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { URL } from 'node:url'

const sourcePath = new URL('../src/App.vue', import.meta.url)

async function loadApp(pdpUrl, { assign = () => {}, storageThrows = false } = {}) {
  const file = await readFile(sourcePath, 'utf8')
  const script = file.match(/<script setup>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '') + '\nfunction setTestService(service) { messageEventService = service }\nexport { signOut, signingOut, signOutError, sidebarOpen, editMessage, viewCode, setTestService }'
  const calls = { assigned: [], stopped: 0, cleared: 0 }
  const store = { activeOrganization: null, workspaceUser: null, isAuthenticated: false, activeContext: null, clearSession() { calls.cleared++ } }
  const context = vm.createContext({ store, createMessageEventService() { return {} }, sessionRecovery: { status: 'idle' }, recoverUnauthorized() { calls.recovered = (calls.recovered || 0) + 1 },
    ref(value) { return { value } },
    computed(fn) { return { get value() { return fn() } } },
    watch() {}, async nextTick() {}, onMounted() {}, onBeforeUnmount() {},
    window: { location: { hash: '', pathname: '/', assign(url) { calls.assigned.push(url); assign(url) } }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), history: { replaceState() {} } },
    sessionStorage: { removeItem(key) { if (storageThrows) throw new Error('storage blocked'); calls.removedKey = key } },
    URL })
  const module = new vm.SourceTextModule(script, { context, identifier: 'App.vue', initializeImportMeta(meta) { meta.env = { VITE_PDP_URL: pdpUrl } } })
  await module.link(() => { throw new Error('unexpected import in extracted App.vue script') })
  await module.evaluate()
  module.namespace // force module evaluation
  // Exercise the actual service-stop path without creating a real EventSource.
  return { api: module.namespace, calls }
}

test('signOut navigates to configured BFF logout URL and clears local state after scheduling navigation', async () => {
  const app = await loadApp('https://pdp.example.test/', { assign: () => {} })
  // No active SSE service in this isolated case; store cleanup is still observable.
  app.api.editMessage.value = { code: 'MSG' }
  app.api.viewCode.value = 'MSG'
  app.api.sidebarOpen.value = true
  app.api.signOut()
  assert.deepEqual(app.calls.assigned, ['https://pdp.example.test/api/v1/session/logout'])
  assert.equal(app.calls.cleared, 1)
  assert.equal(app.calls.recovered || 0, 0)
  assert.equal(app.api.editMessage.value, null)
  assert.equal(app.api.viewCode.value, '')
  assert.equal(app.api.sidebarOpen.value, false)
  assert.equal(app.calls.removedKey, 'security-baseline-login-redirect')
  assert.equal(app.api.signingOut.value, true)
})

test('invalid or absent BFF URL does not clear local session and allows another attempt', async (t) => {
  for (const url of ['', 'file:///tmp/logout', 'javascript:alert(1)']) {
    await t.test(url || 'missing URL', async () => {
      const app = await loadApp(url)
      app.api.signOut()
      assert.equal(app.calls.assigned.length, 0)
      assert.equal(app.calls.cleared, 0)
      assert.equal(app.api.signingOut.value, false)
      assert.notEqual(app.api.signOutError.value, '')
    })
  }
})

test('navigation failure preserves local session and unlocks retry; optional storage failure does not block cleanup', async () => {
  const failed = await loadApp('http://localhost:18080', { assign() { throw new Error('navigation failed') } })
  let stoppedAfterFailure = 0
  failed.api.setTestService({ stop() { stoppedAfterFailure++ } })
  failed.api.signOut()
  assert.equal(failed.calls.cleared, 0)
  assert.equal(stoppedAfterFailure, 0)
  assert.equal(failed.api.signingOut.value, false)
  assert.equal(failed.api.signOutError.value, 'navigation failed')

  const storageBlocked = await loadApp('http://localhost:18080', { storageThrows: true })
  let cleanupAfterStorageFailure = 0
  storageBlocked.api.setTestService({ stop() { cleanupAfterStorageFailure++ } })
  storageBlocked.api.signOut()
  assert.equal(storageBlocked.calls.assigned[0], 'http://localhost:18080/api/v1/session/logout')
  assert.equal(storageBlocked.calls.cleared, 1)
  assert.equal(cleanupAfterStorageFailure, 1)
})

test('duplicate click is ignored while navigation is in progress', async () => {
  const app = await loadApp('https://pdp.example.test')
  app.api.signOut()
  app.api.signOut()
  assert.equal(app.calls.assigned.length, 1)
  assert.equal(app.calls.cleared, 1)
  assert.equal(app.calls.recovered || 0, 0)
})

test('signOut stops active SSE and clears transient view state after accepted navigation', async () => {
  const app = await loadApp('https://pdp.example.test')
  let stops = 0
  app.api.setTestService({ stop() { stops++ } })
  app.api.editMessage.value = { code: 'EDIT' }
  app.api.viewCode.value = 'VIEW'
  app.api.sidebarOpen.value = true
  app.api.signOut()
  assert.equal(stops, 1)
  assert.equal(app.api.editMessage.value, null)
  assert.equal(app.api.viewCode.value, '')
  assert.equal(app.api.sidebarOpen.value, false)
  assert.equal(app.calls.cleared, 1)
})
