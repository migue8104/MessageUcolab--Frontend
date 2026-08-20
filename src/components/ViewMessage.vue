<script setup>
import { ref, watch } from 'vue'
import { messageApi } from '../api'
import { store } from '../store'

const props = defineProps({ code: { type: String, default: '' } })

const code = ref('')
const result = ref(null)
const error = ref('')

async function load() {
  error.value = ''
  result.value = null
  const value = code.value.trim()
  if (!store.token || !value) return
  try {
    const data = await messageApi.byCode(value, store.token)
    result.value = Array.isArray(data) ? data[0] || null : data
    if (!result.value) error.value = 'No se encontró ningún mensaje con ese código.'
  } catch (e) {
    error.value = e.message
  }
}

watch(
  () => props.code,
  (value) => {
    if (value) {
      code.value = value
      load()
    }
  },
  { immediate: true }
)
</script>

<template>
  <section class="card">
    <h2>Consultar mensaje por código</h2>

    <p v-if="!store.token" class="warn">
      No hay token. Ve a la pestaña "Crear mensaje" y genera un token primero.
    </p>

    <template v-else>
      <div class="toolbar">
        <input
          v-model="code"
          placeholder="Código del mensaje (ej. REL_TO_DOC_006)"
          @keyup.enter="load"
        />
        <button :disabled="!code.trim()" @click="load">Consultar</button>
      </div>

      <p v-if="error" class="err">{{ error }}</p>

      <table v-if="result" class="detail">
        <tbody>
          <tr>
            <th>Código</th>
            <td>{{ result.code }}</td>
          </tr>
          <tr>
            <th>Título</th>
            <td>{{ result.title }}</td>
          </tr>
          <tr>
            <th>Contenido</th>
            <td>{{ result.content }}</td>
          </tr>
          <tr>
            <th>Tipo</th>
            <td>{{ result.type }}</td>
          </tr>
          <tr>
            <th>Categoría</th>
            <td>{{ result.category }}</td>
          </tr>
          <tr>
            <th>Aplicación</th>
            <td>{{ result.application }}</td>
          </tr>
          <tr>
            <th>Funcionalidad</th>
            <td>{{ result.functionality }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>
