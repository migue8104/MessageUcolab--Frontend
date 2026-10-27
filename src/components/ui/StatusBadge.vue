<script setup>
import { computed } from 'vue'
const props = defineProps({ status: { type: [String, Object], default: '' } })
const name = computed(() => typeof props.status === 'object' ? props.status?.name || '' : props.status)
const kind = computed(() => /^(active|activo|activa)$/i.test(name.value) ? 'active' : /^(inactive|inactivo|inactiva)$/i.test(name.value) ? 'inactive' : 'neutral')
</script>

<template><span class="status-badge" :class="kind"><i v-if="kind !== 'neutral'" />{{ name || 'No disponible' }}</span></template>
