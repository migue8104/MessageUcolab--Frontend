<script setup>
import { computed } from 'vue'
import { catalogLabel } from '../../presentation'
const props = defineProps({ status: { type: [String, Object], default: '' } })
const name = computed(() => catalogLabel(props.status))
const kind = computed(() => /^(active|activo|activa)$/i.test(name.value) ? 'active' : /^(inactive|inactivo|inactiva)$/i.test(name.value) ? 'inactive' : 'neutral')
</script>

<template><span class="status-badge" :class="kind"><i v-if="kind !== 'neutral'" />{{ name || 'No disponible' }}</span></template>
