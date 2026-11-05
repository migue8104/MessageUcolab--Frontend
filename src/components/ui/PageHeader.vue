<script setup>
defineProps({ title: { type: String, required: true }, description: { type: String, default: '' } })
</script>

<template>
  <header class="page-header">
    <div class="page-heading"><h1>{{ title }}</h1><p v-if="description">{{ description }}</p><slot name="meta" /></div>
    <div v-if="$slots.default" class="page-header-actions"><slot /></div>
  </header>
</template>
