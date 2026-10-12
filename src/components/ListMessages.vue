<script setup>
import { ref } from 'vue'
import { messageApi, toMessageCode } from '../api'
import { store } from '../store'

const emit = defineEmits(['view', 'create'])

const search = ref('')

async function searchCode() {
  const code = toMessageCode(search.value)
  if (!code) return store.loadMessages(false, 1)
  try {
    const data = await messageApi.byCode(code, store.token)
    store.messages = (Array.isArray(data) ? data : data && data.data ? data.data : []).slice(0, 1)
    store.totalMessages = store.messages.length
    store.totalPages = 1
    store.messagesPage = 1
  } catch (e) {
    store.handleUnauthorized(e)
    store.messagesError = e.message
    store.messages = []
  }
}

function next() {
  store.setMessagesPage(store.messagesPage + 1)
}

function prev() {
  store.setMessagesPage(store.messagesPage - 1)
}
</script>

<template>
  <section class="card">
    <div class="toolbar">
      <h2>Mensajes</h2>
      <button @click="emit('create')">+ Crear mensaje</button>
    </div>

    <div class="toolbar">
      <input
        v-model="search"
        placeholder="Buscar por código (ej. MSG_WELCOME)…"
        @keyup.enter="searchCode"
      />
      <button :disabled="!search.trim() || store.messagesLoading" @click="searchCode">Buscar</button>
      <button
        :disabled="store.messagesLoading"
        @click="store.refresh(false)"
      >
        {{ store.messagesLoading ? 'Actualizando…' : 'Actualizar' }}
      </button>
    </div>

    <p v-if="store.messagesLoading" class="info">Cargando mensajes… (la consulta puede tardar 2-3 s)</p>
    <p v-if="store.messagesError" class="err">{{ store.messagesError }}</p>

    <table v-if="store.messages.length">
      <thead>
        <tr>
          <th>Código</th>
          <th>Título</th>
          <th>Contenido</th>
          <th>Tipo</th>
          <th>Categoría</th>
          <th>Funcionalidad</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in store.messages" :key="m.code">
          <td>{{ m.code }}</td>
          <td>{{ m.title }}</td>
          <td>{{ m.content }}</td>
          <td>{{ m.type }}</td>
          <td>{{ m.category }}</td>
          <td>{{ m.functionality }}</td>
          <td><button class="link" @click="emit('view', m.code)">Ver</button></td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!store.messagesLoading && !store.messagesError" class="info">
      Sin mensajes registrados.
    </p>

    <div v-if="!store.messagesLoading && store.totalPages > 1" class="toolbar">
      <button :disabled="store.messagesPage <= 1" @click="prev">← Anterior</button>
      <span>
        Página {{ store.messagesPage }} de {{ store.totalPages }} · {{ store.totalMessages }} mensajes
      </span>
      <button :disabled="store.messagesPage >= store.totalPages" @click="next">Siguiente →</button>
    </div>
  </section>
</template>