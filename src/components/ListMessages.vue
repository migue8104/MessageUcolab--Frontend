<script setup>
import { ref, onMounted } from 'vue'
import { messageApi } from '../api'
import { store } from '../store'

const emit = defineEmits(['view'])

const messages = ref([])
const search = ref('')
const current = ref(0)
const totalItems = ref(0)
const totalPages = ref(0)
const error = ref('')
const loading = ref(false)

const SIZE = 10

async function loadPage(page) {
  error.value = ''
  loading.value = true
  try {
    const code = search.value.trim()
    if (code) {
      // búsqueda por código usa el endpoint de consulta por código
      const data = await messageApi.byCode(code, store.token)
      messages.value = Array.isArray(data) ? data : []
      totalItems.value = messages.value.length
      totalPages.value = messages.value.length ? 1 : 0
      current.value = 0
    } else {
      const data = await messageApi.list(page, SIZE, store.token)
      messages.value = (data && data.data) || []
      totalItems.value = (data && data.totalItems) || 0
      totalPages.value = (data && data.totalPages) || 0
      // la página en la respuesta es 1-based
      current.value = data && data.page ? data.page - 1 : page
    }
  } catch (e) {
    error.value = e.message
    messages.value = []
  } finally {
    loading.value = false
  }
}

function next() {
  if (current.value + 1 < totalPages.value) loadPage(current.value + 1)
}

function prev() {
  if (current.value > 0) loadPage(current.value - 1)
}

onMounted(() => {
  if (store.token) loadPage(0)
})
</script>

<template>
  <section class="card">
    <h2>Mensajes</h2>

    <p v-if="!store.token" class="warn">
      No hay token. Ve a la pestaña "Crear mensaje" y genera un token primero.
    </p>

    <template v-else>
      <div class="toolbar">
        <input
          v-model="search"
          placeholder="Buscar por código (vacío = listar todo)"
          @keyup.enter="loadPage(0)"
        />
        <button @click="loadPage(0)">Buscar</button>
      </div>

      <p v-if="loading" class="info">Cargando… (la consulta puede tardar 2-3 s)</p>
      <p v-if="error" class="err">{{ error }}</p>

      <table v-if="messages.length">
        <thead>
          <tr>
            <th>Código</th>
            <th>Título</th>
            <th>Contenido</th>
            <th>Tipo</th>
            <th>Categoría</th>
            <th>Aplicación</th>
            <th>Funcionalidad</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in messages" :key="m.code">
            <td>{{ m.code }}</td>
            <td>{{ m.title }}</td>
            <td>{{ m.content }}</td>
            <td>{{ m.type }}</td>
            <td>{{ m.category }}</td>
            <td>{{ m.application }}</td>
            <td>{{ m.functionality }}</td>
            <td><button class="link" @click="emit('view', m.code)">Ver</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!loading && !error" class="info">Sin resultados.</p>

      <div class="toolbar">
        <button :disabled="current === 0" @click="prev">← Anterior</button>
        <span>
          Página {{ current + 1 }} de {{ totalPages || 1 }} · {{ totalItems }} mensajes
        </span>
        <button :disabled="current + 1 >= totalPages" @click="next">Siguiente →</button>
      </div>
    </template>
  </section>
</template>
