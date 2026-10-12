<script setup>
import { ref, computed } from 'vue'
import { store } from '../store'

const emit = defineEmits(['selected'])

const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return store.contexts
  return store.contexts.filter((c) => contextText(c).toLowerCase().includes(q))
})

const errorText = computed(() => {
  const err = store.contextsError
  if (!err) return ''
  return typeof err === 'string' ? err : JSON.stringify(err)
})

function contextText(ctx) {
  const parts = [
    ctx.organization && (ctx.organization.name || ctx.organization),
    ctx.application && (ctx.application.name || ctx.application),
    ctx.environment && (ctx.environment.name || ctx.environment)
  ]
  return parts.filter(Boolean).join(' ')
}

async function select(ctx) {
  try {
    await store.selectContext(ctx)
    emit('selected')
  } catch (_) {
    // el error queda expuesto en store.contextsError
  }
}
</script>

<template>
  <section class="card">
    <h2>Selecciona tu espacio de trabajo</h2>
    <p class="info">
      Son las combinaciones de organización, aplicación y ambiente a las que tienes acceso.
    </p>

    <div class="toolbar">
      <input v-model="search" placeholder="Buscar por organización, aplicación o ambiente…" />
    </div>

    <p v-if="store.contextsLoading" class="info">Cargando contextos…</p>
    <p v-if="errorText" class="err">
      {{ errorText }}
      <button class="link" @click="store.loadContexts()">Reintentar</button>
    </p>

    <div class="ctx-grid">
      <div v-for="c in filtered" :key="c.contextId || c.id || contextText(c)" class="ctx-card">
        <strong class="ctx-app">{{ c.application?.name || c.applicationName || c.application }}</strong>
        <span class="ctx-org">{{ c.organization?.name || c.organizationName || c.organization }}</span>
        <span class="ctx-env">Ambiente: {{ c.environment?.name || c.environmentName || c.environment }}</span>
        <button @click="select(c)">Seleccionar</button>
      </div>
    </div>

    <p v-if="!store.contextsLoading && !store.contexts.length && !store.contextsError" class="info">
      No tienes contextos disponibles. Solicita acceso a un administrador.
    </p>
  </section>
</template>

<style scoped>
.ctx-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr));
  gap: 10px;
  margin-top: 12px;
}

.ctx-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid #dfe6ef;
  border-radius: 5px;
  padding: 15px;
  background: #fff;
  transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}

.ctx-card:hover {
  transform: translateY(-2px);
  border-color: #72a9e9;
  box-shadow: 0 8px 18px rgb(9 35 77 / 8%);
}

.ctx-card button {
  margin-top: 10px;
  width: 100%;
}

.ctx-app {
  color: #102b52;
  font-size: 13px;
}

.ctx-org {
  color: #315d94;
  font-weight: 600;
}

.ctx-env {
  color: #697b92;
  font-size: 11px;
}
</style>