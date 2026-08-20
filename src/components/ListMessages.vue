<script setup>
import { ref, onMounted } from 'vue'
import { messageApi } from '../api'
import { store } from '../store'

const emit = defineEmits(['view'])

const messages = ref([])
const totalItems = ref(0)
const error = ref('')
const loading = ref(false)

const SIZE = 10

async function loadAll() {
  error.value = ''
  loading.value = true
  try {
    const first = await messageApi.list(0, SIZE, store.token)
    const totalPages = (first && first.totalPages) || 1
    totalItems.value = (first && first.totalItems) || 0

    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => messageApi.list(i + 1, SIZE, store.token))
    )

    messages.value = [
      ...((first && first.data) || []),
      ...rest.flatMap((d) => (d && d.data) || [])
    ]
  } catch (e) {
    error.value = e.message
    messages.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (store.token) loadAll()
})
</script>

<template>
  <section class="card">
    <h2>Mensajes</h2>

    <p v-if="!store.token" class="warn">
      No hay token. Ve a la pestaña "Crear token" y genera uno primero.
    </p>

    <template v-else>
      <p v-if="loading" class="info">Cargando mensajes… (la consulta puede tardar 2-3 s)</p>
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
      <p v-else-if="!loading && !error" class="info">
        Sin mensajes registrados · {{ totalItems }} en total.
      </p>
      <p v-if="!loading && !error && messages.length" class="info">
        Mostrando {{ messages.length }} de {{ totalItems }} mensajes.
      </p>
    </template>
  </section>
</template>