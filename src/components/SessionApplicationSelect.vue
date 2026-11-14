<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { store } from '../store'
import { catalogApi } from '../api'
import { asList, catalogLabel } from '../presentation'
import AppModal from './ui/AppModal.vue'
import AppIcon from './ui/AppIcon.vue'
import PageHeader from './ui/PageHeader.vue'
import EmptyState from './ui/EmptyState.vue'
import EnvironmentBadge from './ui/EnvironmentBadge.vue'
import ServiceIdentitiesModal from './ServiceIdentitiesModal.vue'

const emit = defineEmits(['selected', 'workspace-selected'])
const organizationName = ref('')
const busy = ref(false)
const error = ref('')
const modal = ref('')
const pendingDelete = ref(null)
const deleteName = ref('')
const deleteConfirmed = ref(false)
const notice = ref('')
const canDelete = computed(() => pendingDelete.value && !busy.value && deleteConfirmed.value
  && deleteName.value === pendingDelete.value.name
  && pendingDelete.value.organizationId === store.activeOrganization?.id)
const applicationEnvironments = ref({})
const environmentErrors = ref({})
let environmentVersion = 0
watch(() => store.organizationApplications, async (apps) => {
  const version = ++environmentVersion
  applicationEnvironments.value = {}
  environmentErrors.value = {}
  await Promise.all(apps.map(async (app) => {
    try {
      const environments = asList(await catalogApi.environments(app.id))
      if (version === environmentVersion) applicationEnvironments.value[app.id] = environments
    } catch (e) {
      store.handleUnauthorized(e)
      if (version === environmentVersion) environmentErrors.value[app.id] = e.message
    }
  }))
}, { immediate: true })

function organizationCount(id) {
  return store.sessionApplications.filter((app) => app.organization?.id === id).length
}

function openCreate() {
  error.value = ''
  notice.value = ''
  modal.value = store.activeOrganization ? 'application' : 'organization'
}
const applicationForm = reactive({
  name: '',
  languageId: store.languages[0]?.value || '',
  stateId: store.applicationStates[0]?.value || ''
})

async function perform(action) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    store.handleUnauthorized(e)
    error.value = e.message
  } finally {
    busy.value = false
  }
}

function openOrganization(organization) {
  return perform(async () => {
    await store.selectOrganization(organization)
    emit('workspace-selected')
  })
}

function createOrganization() {
  if (!organizationName.value.trim()) return (error.value = 'Ingresa el nombre de la organización.')
  return perform(async () => {
    await store.createPersonalOrganization(organizationName.value.trim())
    organizationName.value = ''
    modal.value = ''
    emit('workspace-selected')
  })
}

function createApplication() {
  if (!applicationForm.name.trim()) return (error.value = 'Ingresa el nombre de la aplicación.')
  return perform(async () => {
    await store.createPersonalApplication({ ...applicationForm, name: applicationForm.name.trim() })
    applicationForm.name = ''
    modal.value = ''
  })
}

function select(app) {
  return perform(async () => {
    await store.selectSessionApplication({ ...app, organization: store.activeOrganization })
    emit('selected')
  })
}

function requestDelete(app) {
  if (busy.value || store.contextsLoading) return
  error.value = ''
  notice.value = ''
  deleteName.value = ''
  deleteConfirmed.value = false
  pendingDelete.value = { id: app.id, name: app.name, organizationId: store.activeOrganization.id }
}

function closeDelete() {
  if (busy.value) return
  pendingDelete.value = null
  error.value = ''
}

function deleteApplication() {
  if (!canDelete.value) return
  const application = pendingDelete.value
  return perform(async () => {
    await store.deletePersonalApplication(application.id)
    pendingDelete.value = null
    notice.value = `Se eliminó la aplicación ${application.name} y sus datos asociados.`
  })
}

// Las aplicaciones consumidoras se identifican con su identidad de servicio: el propietario asocia el
// client_id de cada identidad al ambiente que consume y ya no se copian identificadores.
const identitiesApp = ref(null)
const ENVIRONMENT_ORDER = ['develop', 'testing', 'produccion']
function environmentsInOrder(app) {
  const rank = (env) => {
    const i = ENVIRONMENT_ORDER.indexOf(env.name?.toLowerCase())
    return i < 0 ? ENVIRONMENT_ORDER.length : i
  }
  return [...(applicationEnvironments.value[app.id] || [])].sort((a, b) => rank(a) - rank(b))
}
function back() {
  store.activeOrganization = null
  store.organizationApplications = []
  error.value = ''
  notice.value = ''
  emit('workspace-selected')
}
</script>

<template>
  <section class="card workspace-card" :aria-busy="busy || store.contextsLoading">
    <div class="workspace-heading"><button v-if="store.activeOrganization" class="icon-button soft" aria-label="Volver a mis organizaciones" :disabled="busy" @click="back"><AppIcon name="back" /></button><PageHeader :title="store.activeOrganization ? 'Mis aplicaciones' : 'Mis organizaciones'" :description="store.activeOrganization ? `Gestiona las aplicaciones de la organización ${store.activeOrganization.name}.` : 'Gestiona tus organizaciones y accede a sus aplicaciones.'"><template #meta><span v-if="store.activeOrganization" class="organization-caption"><AppIcon name="building" :size="15" />{{ store.activeOrganization.name }}</span></template><button :disabled="busy || store.contextsLoading" @click="openCreate"><AppIcon name="plus" :size="17" />{{ store.activeOrganization ? 'Crear aplicación' : 'Crear organización' }}</button></PageHeader></div>
    <p v-if="store.contextsLoading" class="info" role="status">Cargando espacio de trabajo…</p>
    <p v-if="store.contextsError" class="err" role="alert">
      {{ store.contextsError }}
      <button class="link" :disabled="busy || store.contextsLoading" @click="store.loadSessionApplications()">Reintentar</button>
    </p>
    <p v-if="error && !modal && !pendingDelete" class="alert error" role="alert">{{ error }}</p>
    <p v-if="notice" class="info" role="status">{{ notice }}</p>

    <fieldset :disabled="busy || store.contextsLoading">
      <template v-if="!store.activeOrganization">
        <div class="workspace-cards">
          <button v-for="organization in store.organizations" :key="organization.id" class="workspace-item" @click="openOrganization(organization)"><span class="workspace-item-icon"><AppIcon name="building" :size="28" /></span><span class="workspace-item-copy"><strong>{{ organization.name }}</strong><small>{{ organizationCount(organization.id) }} {{ organizationCount(organization.id) === 1 ? 'aplicación' : 'aplicaciones' }}</small></span><AppIcon name="chevron" /></button>
        </div>
        <EmptyState v-if="!store.contextsLoading && !store.organizations.length && !store.contextsError" icon="building" title="Tu espacio de trabajo empieza aquí" description="Crea tu primera organización para administrar aplicaciones y mensajes."><button @click="openCreate"><AppIcon name="plus" :size="16" />Crear organización</button></EmptyState>
      </template>

      <template v-else>
        <div class="workspace-cards">
          <div v-for="app in store.organizationApplications" :key="app.id">
            <button class="workspace-item" @click="select(app)"><span class="workspace-item-icon"><AppIcon name="grid" :size="29" /></span><span class="workspace-item-copy"><strong>{{ app.name }}</strong><small>Idioma base: {{ catalogLabel(app.language?.name) || 'no disponible en el catálogo' }}</small><span class="badge-list"><EnvironmentBadge v-for="env in applicationEnvironments[app.id] || []" :key="env.id" :name="env.name" /><small v-if="!applicationEnvironments[app.id] && !environmentErrors[app.id]">Cargando ambientes…</small></span></span><AppIcon name="chevron" /></button>
            <div class="application-actions"><button v-if="applicationEnvironments[app.id]?.length" type="button" class="link" :aria-label="`Identidades de servicio de ${app.name}`" @click="identitiesApp = app"><AppIcon name="shield" :size="15" />Identidades de servicio</button><button type="button" class="link danger" :aria-label="`Eliminar aplicación ${app.name}`" @click="requestDelete(app)"><AppIcon name="trash" :size="15" />Eliminar aplicación</button></div>
            <p v-if="environmentErrors[app.id]" class="alert error" role="alert">No se pudieron consultar los ambientes: {{ environmentErrors[app.id] }}</p>
          </div>
        </div>
        <EmptyState v-if="!store.contextsLoading && !store.organizationApplications.length" icon="grid" title="Aún no hay aplicaciones" description="Crea una aplicación y empieza a organizar sus mensajes."><button @click="openCreate"><AppIcon name="plus" :size="16" />Crear aplicación</button></EmptyState>
      </template>
    </fieldset>
    <AppModal v-if="modal" :title="modal === 'organization' ? 'Crear organización' : 'Crear aplicación'" :description="modal === 'organization' ? 'Un espacio para organizar tus aplicaciones.' : `Nueva aplicación en ${store.activeOrganization?.name}.`" :busy="busy" @close="modal = ''">
      <form class="modal-form" @submit.prevent="modal === 'organization' ? createOrganization() : createApplication()">
        <fieldset :disabled="busy"><label v-if="modal === 'organization'">Nombre de la organización <span class="required">*</span><input v-model="organizationName" required maxlength="50" autocomplete="organization" placeholder="Ej. Universidad UCO" /></label><template v-else><label>Nombre de la aplicación <span class="required">*</span><input v-model="applicationForm.name" required maxlength="50" placeholder="Ej. Portal académico" /></label><label>Idioma base <span class="required">*</span><select v-model="applicationForm.languageId" required><option v-for="language in store.languages" :key="language.value" :value="language.value">{{ language.name }}</option></select></label><p class="context-notice"><AppIcon name="grid" :size="17" />Se crearán automáticamente los ambientes Develop, Testing y Produccion.</p></template></fieldset>
        <p v-if="error" class="alert error" role="alert">{{ error }}</p><footer class="form-actions"><button type="button" class="secondary" :disabled="busy" @click="modal = ''">Cancelar</button><button type="submit" :disabled="busy">{{ busy ? 'Guardando…' : modal === 'organization' ? 'Crear organización' : 'Crear aplicación' }}</button></footer>
      </form>
    </AppModal>
    <ServiceIdentitiesModal v-if="identitiesApp" :application="identitiesApp" :environments="environmentsInOrder(identitiesApp)" @close="identitiesApp = null" />
    <AppModal v-if="pendingDelete" title="Eliminar aplicación" description="Esta acción es permanente y afecta todos sus ambientes, incluido Produccion." :busy="busy" @close="closeDelete">
      <form class="modal-form application-delete-form" @submit.prevent="deleteApplication">
        <p>Se eliminará <strong>{{ pendingDelete.name }}</strong> junto con todas sus funcionalidades, mensajes, traducciones en caché, ambientes e importaciones. No se eliminará la organización ni otras aplicaciones. Se conservará el historial de auditoría.</p>
        <fieldset :disabled="busy">
          <label>Escribe el nombre exacto de la aplicación para continuar<input v-model="deleteName" required autocomplete="off" :placeholder="pendingDelete.name" /></label>
          <label class="application-delete-confirm"><input v-model="deleteConfirmed" type="checkbox" required /><span>Entiendo que se eliminarán todos los datos de gestión de esta aplicación y que no se puede deshacer.</span></label>
        </fieldset>
        <p v-if="error" class="alert error" role="alert">{{ error }}</p>
        <footer class="form-actions"><button type="button" class="secondary" :disabled="busy" @click="closeDelete">Cancelar</button><button type="submit" class="secondary danger" :disabled="!canDelete"><AppIcon name="trash" :size="16" />{{ busy ? 'Eliminando…' : 'Eliminar aplicación y sus datos' }}</button></footer>
      </form>
    </AppModal>
  </section>
</template>

<style scoped>
.application-actions { display: flex; justify-content: flex-end; gap: 16px; margin-top: 8px; }
:global(.app-modal:has(.application-delete-form)) { width: min(620px, calc(100vw - 32px)); }
.business-ui .application-delete-confirm { display: flex; flex-direction: row; align-items: flex-start; gap: 10px; }
.business-ui .application-delete-confirm input[type="checkbox"] { margin: 2px 0 0; flex-shrink: 0; }
.application-delete-confirm span { flex: 1; min-width: 0; }
</style>
