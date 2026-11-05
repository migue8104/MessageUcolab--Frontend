<script setup>
import AppIcon from './AppIcon.vue'
defineProps({ title: { type: String, default: 'Todavía no hay datos' }, description: { type: String, default: '' }, icon: { type: String, default: 'messages' } })
</script>

<template>
  <div class="empty-state"><span class="empty-icon"><AppIcon :name="icon" :size="26" /></span><h3>{{ title }}</h3><p v-if="description">{{ description }}</p><slot /></div>
</template>
