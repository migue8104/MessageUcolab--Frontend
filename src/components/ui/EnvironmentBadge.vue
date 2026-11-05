<script setup>
import { computed } from 'vue'
import { environmentTone, environmentName } from '../../presentation'
const props = defineProps({ name: { type: String, required: true } })
const kind = computed(() => environmentTone(props.name))
</script>

<template><span class="environment-badge environment-theme" :class="kind"><i />{{ environmentName(name) }}</span></template>
