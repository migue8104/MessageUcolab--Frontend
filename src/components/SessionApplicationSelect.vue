<script setup>
import { reactive, ref, watch } from 'vue'
import { store } from '../store'
import { catalogApi } from '../api'
import { asList, catalogLabel } from '../presentation'
import AppModal from './ui/AppModal.vue'
import AppIcon from './ui/AppIcon.vue'
import PageHeader from './ui/PageHeader.vue'
import EmptyState from './ui/EmptyState.vue'
import EnvironmentBadge from './ui/EnvironmentBadge.vue'

const emit = defineEmits(['selected'])
const organizationName = ref('')
const busy = ref(false)
const error = ref('')
const modal = ref('')
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
  return perform(() => store.selectOrganization(organization))
}

function createOrganization() {
  if (!organizationName.value.trim()) return (error.value = 'Ingresa el nombre de la organización.')
  return perform(async () => {
    await store.createPersonalOrganization(organizationName.value.trim())
    organizationName.value = ''
    modal.value = ''
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

// Las aplicaciones consumidoras leen sus mensajes con estos dos identificadores. Se copian al
// portapapeles listos para pegar en la configuración del backend y del front, sin mostrarlos.
const copied = ref('')
let copiedTimer = 0
const ENVIRONMENT_ORDER = ['develop', 'testing', 'produccion']
function environmentsInOrder(app) {
  const rank = (env) => {
    const i = ENVIRONMENT_ORDER.indexOf(env.name?.toLowerCase())
    return i < 0 ? ENVIRONMENT_ORDER.length : i
  }
  return [...(applicationEnvironments.value[app.id] || [])].sort((a, b) => rank(a) - rank(b))
}
async function copyIdentifiers(app, env) {
  const text = [
    `MESSAGEUCOLAB_APPLICATION_ID=${app.id}`,
    `MESSAGEUCOLAB_ENVIRONMENT_ID=${env.id}`,
    `VITE_MESSAGEUCOLAB_APPLICATION_ID=${app.id}`,
    `VITE_MESSAGEUCOLAB_ENVIRONMENT_ID=${env.id}`
  ].join('\n')
  error.value = ''
  try {
    await navigator.clipboard.writeText(text)
    copied.value = `${app.id}:${env.id}`
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = ''), 2500)
  } catch {
    error.value = 'No se pudieron copiar los identificadores. Revisa que el navegador permita usar el portapapeles.'
  }
}

function back() {
  store.activeOrganization = null
  store.organizationApplications = []
  error.value = ''
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
    <p v-if="error && !modal" class="alert error" role="alert">{{ error }}</p>

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
            <div v-if="applicationEnvironments[app.id]?.length" class="copy-ids">
              <span>Copiar identificadores:</span>
              <button v-for="env in environmentsInOrder(app)" :key="env.id" type="button" class="secondary copy-ids-button" :aria-label="`Copiar los identificadores de ${app.name} en ${env.name}`" @click="copyIdentifiers(app, env)"><AppIcon :name="copied === `${app.id}:${env.id}` ? 'check' : 'copy'" :size="14" />{{ env.name }}</button>
              <span v-if="copied.startsWith(`${app.id}:`)" class="copy-ids-done" role="status">Copiados al portapapeles</span>
            </div>
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
  </section>
</template>
