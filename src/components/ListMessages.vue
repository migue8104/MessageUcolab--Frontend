<script setup>
import { onMounted } from 'vue'
import { store } from '../store'

const emit = defineEmits(['view'])

onMounted(() => {
  store.loadMessages()
})
</script>

<template>
  <section class="card">
    <div class="toolbar">
      <h2>Mensajes</h2>
      <button :disabled="store.messagesLoading" @click="store.refresh(false)">
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
          <th>Aplicación</th>
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
          <td>{{ m.application }}</td>
          <td>{{ m.functionality }}</td>
          <td><button class="link" @click="emit('view', m.code)">Ver</button></td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!store.messagesLoading && !store.messagesError" class="info">
      Sin mensajes registrados · {{ store.totalMessages }} en total.
    </p>
    <p v-if="!store.messagesLoading && !store.messagesError && store.messages.length" class="info">
      Mostrando {{ store.messages.length }} de {{ store.totalMessages }} mensajes.
    </p>
  </section>
</template>