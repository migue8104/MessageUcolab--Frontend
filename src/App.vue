<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { store } from './store'
import CreateCatalog from './components/CreateCatalog.vue'
import CreateMessage from './components/CreateMessage.vue'
import CreateToken from './components/CreateToken.vue'
import ListMessages from './components/ListMessages.vue'
import TranslateMessage from './components/TranslateMessage.vue'
import ViewMessage from './components/ViewMessage.vue'

const tab = ref('list')
const viewCode = ref('')

function goView(code) {
  viewCode.value = code
  tab.value = 'view'
}

function clearToken() {
  store.setToken('')
}

// Cuando se crea un mensaje o token, refrescamos los datos al instante
function onMessageCreated() {
  store.loadMessages()
  store.loadCatalogs()
}

function onTokenCreated() {
  store.loadCatalogs()
}

function onCatalogCreated() {
  store.loadCatalogs()
}

// Polling: re-consulta catálogos y mensajes para reflejar cambios externos
// (ej. eliminación de un item en la base de datos) sin recargar el navegador.
let pollId = null

onMounted(() => {
  store.refresh()
  pollId = setInterval(() => store.refresh(), 2000)
})

onUnmounted(() => {
  clearInterval(pollId)
})
</script>

<template>
  <header class="bar">
    <h1>MessageUcoLab</h1>
    <span v-if="store.token" class="badge ok">Token activo</span>
    <span v-else class="badge warn">Sin token</span>
    <button v-if="store.token" class="link" @click="clearToken">Quitar token</button>
  </header>

  <nav class="tabs">
    <button :class="{ active: tab === 'list' }" @click="tab = 'list'">Mensajes</button>
    <button :class="{ active: tab === 'create' }" @click="tab = 'create'">Crear mensaje</button>
    <button :class="{ active: tab === 'token' }" @click="tab = 'token'">Crear token</button>
    <button :class="{ active: tab === 'catalog' }" @click="tab = 'catalog'">Catálogos</button>
    <button :class="{ active: tab === 'translate' }" @click="tab = 'translate'">Traducir</button>
    <button :class="{ active: tab === 'view' }" @click="tab = 'view'">Consultar</button>
  </nav>

  <main>
    <ListMessages v-if="tab === 'list'" @view="goView" />
    <CreateMessage v-else-if="tab === 'create'" @created="onMessageCreated" />
    <CreateToken v-else-if="tab === 'token'" @created="onTokenCreated" />
    <CreateCatalog v-else-if="tab === 'catalog'" @created="onCatalogCreated" />
    <TranslateMessage v-else-if="tab === 'translate'" />
    <ViewMessage v-else :code="viewCode" />
  </main>
</template>