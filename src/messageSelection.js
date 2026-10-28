import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { messageApi } from './api'
import { store, unwrapPage } from './store'

export function useMessageSelection() {
  const selectedCodes = ref(new Set())
  const selecting = ref(false)
  const deleting = ref(false)
  const pendingDelete = ref(null)
  const deleteProgress = ref(0)
  const pendingEnvironmentEdit = ref(null)
  const environmentIds = ref([])
  const updatingEnvironments = ref(false)
  const environmentProgress = ref(0)
  const error = ref('')
  const notice = ref('')
  let active = true
  let selectionVersion = 0

  const query = computed(() => ({
    applicationId: store.activeContext?.applicationId,
    code: store.messageSearch,
    title: store.messageTitleSearch,
    statusId: store.messageStatusFilter,
    functionalityId: store.functionalityFilter,
    sort: store.messagesSortDirection,
    columnSort: store.messagesSortColumn
  }))
  const queryKey = computed(() => JSON.stringify([query.value, [...store.environmentFilter].sort()]))
  const busy = computed(() => selecting.value || deleting.value || updatingEnvironments.value)
  const disabled = computed(() => busy.value || store.messagesLoading || !!store.messagesError || !store.activeContext?.applicationId || !store.isAuthenticated)
  const selectedCount = computed(() => selectedCodes.value.size)
  const selectedOnPage = computed(() => store.messages.filter((message) => selectedCodes.value.has(message.code)).length)
  const allOnPage = computed(() => store.messages.length > 0 && selectedOnPage.value === store.messages.length)
  const someOnPage = computed(() => selectedOnPage.value > 0 && !allOnPage.value)
  const allEditEnvironments = computed({
    get: () => !!pendingEnvironmentEdit.value?.environments.length
      && pendingEnvironmentEdit.value.environments.every((env) => environmentIds.value.includes(env.id)),
    set: (checked) => {
      if (!updatingEnvironments.value) {
        environmentIds.value = checked ? pendingEnvironmentEdit.value.environments.map((env) => env.id) : []
      }
    }
  })

  function clearSelection() {
    selectedCodes.value = new Set()
  }

  watch(queryKey, () => {
    selectionVersion += 1
    clearSelection()
    pendingDelete.value = null
    pendingEnvironmentEdit.value = null
    environmentIds.value = []
    error.value = ''
    notice.value = ''
  }, { flush: 'sync' })

  onBeforeUnmount(() => {
    active = false
    selectionVersion += 1
  })

  function toggleMessage(code, checked) {
    if (disabled.value) return
    if (checked) selectedCodes.value.add(code)
    else selectedCodes.value.delete(code)
  }

  function togglePage(checked) {
    if (disabled.value) return
    for (const message of store.messages) toggleMessage(message.code, checked)
  }

  async function selectAllResults() {
    if (disabled.value) return
    const version = ++selectionVersion
    const filters = { ...query.value }
    const environmentIds = [...store.environmentFilter]
    const codes = new Set()
    selecting.value = true
    error.value = ''
    notice.value = ''
    try {
      let page = 1
      let hasMore = true
      while (hasMore) {
        if (!active || version !== selectionVersion) return
        const result = unwrapPage(await messageApi.list(page, 50, environmentIds, filters))
        if (!active || version !== selectionVersion) return
        const messages = result.data || []
        const previousCount = codes.size
        for (const message of messages) codes.add(message.code)
        hasMore = result.totalPages > 0 ? page < result.totalPages
          : result.totalItems > 0 ? codes.size < result.totalItems : messages.length === 50
        if ((messages.length && previousCount === codes.size) || (!messages.length && hasMore)) {
          throw new Error('El listado cambió mientras se seleccionaban los mensajes. Actualiza la lista e inténtalo de nuevo.')
        }
        page += 1
      }
      selectedCodes.value = codes
      notice.value = `Se seleccionaron ${codes.size} mensajes de los resultados filtrados, incluyendo las otras páginas.`
    } catch (e) {
      store.handleUnauthorized(e)
      if (active && version === selectionVersion) error.value = e.message
    } finally {
      selecting.value = false
    }
  }

  function requestDelete(codes = [...selectedCodes.value]) {
    if (disabled.value || pendingEnvironmentEdit.value || !codes.length) return
    error.value = ''
    notice.value = ''
    pendingDelete.value = {
      codes: [...codes],
      applicationId: query.value.applicationId,
      applicationName: store.activeContext.applicationName,
      key: queryKey.value,
      version: selectionVersion
    }
  }

  function closeDelete() {
    if (!deleting.value) pendingDelete.value = null
  }

  function isBatchCurrent(batch) {
    return active && batch.key === queryKey.value && batch.version === selectionVersion
  }

  async function runBatch(batch, operation, progress) {
    const completed = new Set()
    const failures = []
    for (const code of batch.codes) {
      if (!isBatchCurrent(batch)) break
      try {
        await operation(code, batch.applicationId)
        completed.add(code)
        if (isBatchCurrent(batch)) selectedCodes.value.delete(code)
      } catch (e) {
        store.handleUnauthorized(e)
        failures.push(`${code}: ${e.message}`)
        // No repetir mutaciones ni continuar ante errores de sesión o de resultado incierto.
        if (!e.status || e.status === 401 || e.status === 403 || e.status === 429 || e.status >= 500) break
      } finally {
        progress.value += 1
      }
    }
    return { completed, failures }
  }

  async function finishBatch(batch, result, successLabel, failureLabel) {
    if (!isBatchCurrent(batch)) return
    const remaining = batch.codes.filter((code) => !result.completed.has(code))
    selectedCodes.value = new Set([...selectedCodes.value, ...remaining])
    notice.value = `${result.completed.size} de ${batch.codes.length} ${successLabel}.`
    if (remaining.length) {
      error.value = `No se confirmó ${failureLabel} de ${remaining.length} mensajes; siguen seleccionados. Revisa el listado antes de reintentar.\n${result.failures.join('\n')}`
    }
    await store.loadMessages(false, 1)
  }

  async function deleteMessages() {
    const batch = pendingDelete.value
    if (!batch || disabled.value || !isBatchCurrent(batch)) return
    deleting.value = true
    deleteProgress.value = 0
    try {
      const result = await runBatch(batch, (code, applicationId) => messageApi.remove(code, applicationId), deleteProgress)
      await finishBatch(batch, result, 'mensajes eliminados', 'la eliminación')
    } finally {
      pendingDelete.value = null
      deleting.value = false
    }
  }

  function requestEnvironmentEdit() {
    if (disabled.value || pendingDelete.value || !selectedCount.value) return
    error.value = ''
    notice.value = ''
    environmentIds.value = []
    pendingEnvironmentEdit.value = {
      codes: [...selectedCodes.value],
      applicationId: query.value.applicationId,
      applicationName: store.activeContext.applicationName,
      environments: store.environments.map((env) => ({ id: env.id, name: env.name })),
      key: queryKey.value,
      version: selectionVersion
    }
  }

  function closeEnvironmentEdit() {
    if (!updatingEnvironments.value) pendingEnvironmentEdit.value = null
  }

  async function updateSelectedEnvironments() {
    const batch = pendingEnvironmentEdit.value
    if (!batch || disabled.value || !isBatchCurrent(batch)) return
    const targets = [...new Set(environmentIds.value)]
    if (!targets.length || targets.some((id) => !batch.environments.some((env) => env.id === id)
      || !store.environments.some((env) => env.id === id))) {
      error.value = 'Selecciona al menos un ambiente disponible de esta aplicación.'
      return
    }
    error.value = ''
    updatingEnvironments.value = true
    environmentProgress.value = 0
    try {
      const result = await runBatch(batch,
        (code, applicationId) => messageApi.updateEnvironments(code, targets, applicationId), environmentProgress)
      await finishBatch(batch, result, 'mensajes con ambientes actualizados', 'el cambio de ambientes')
    } finally {
      pendingEnvironmentEdit.value = null
      updatingEnvironments.value = false
    }
  }

  return {
    selectedCodes, selectedCount, allOnPage, someOnPage, busy, disabled,
    selecting, deleting, pendingDelete, deleteProgress, error, notice,
    clearSelection, toggleMessage, togglePage, selectAllResults,
    requestDelete, closeDelete, deleteMessages,
    pendingEnvironmentEdit, environmentIds, allEditEnvironments, updatingEnvironments, environmentProgress,
    requestEnvironmentEdit, closeEnvironmentEdit, updateSelectedEnvironments
  }
}
