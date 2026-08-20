<script setup>
import { ref } from 'vue'
import { store } from './store'
import CreateMessage from './components/CreateMessage.vue'
import CreateToken from './components/CreateToken.vue'
import ListMessages from './components/ListMessages.vue'
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
    <button :class="{ active: tab === 'view' }" @click="tab = 'view'">Consultar</button>
  </nav>

  <main>
    <ListMessages v-if="tab === 'list'" @view="goView" />
    <CreateMessage v-else-if="tab === 'create'" />
    <CreateToken v-else-if="tab === 'token'" />
    <ViewMessage v-else :code="viewCode" />
  </main>
</template>
