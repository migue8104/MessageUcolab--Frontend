<script setup>
defineProps({ name: { type: String, default: 'grid' }, size: { type: [Number, String], default: 18 } })
const paths = {
  messages: 'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5',
  plus: 'M12 5v14 M5 12h14',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  translate: 'M3 5h12 M9 3v2 M5 5c0 6 6 9 8 10 M13 5c0 6-6 9-10 10 M13 21l4-10 4 10 M15 17h4',
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9S4 17 4 12V6z M9 12l2 2 4-4',
  building: 'M4 21V5l10-2v18 M14 9h6v12 M2 21h20 M8 7v1 M11 7v1 M8 11v1 M11 11v1 M8 15v1 M11 15v1 M8 21v-2h3v2 M17 12v1 M17 16v1',
  grid: 'M12 3l9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  chevron: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  sort: 'M8 4v16 M4 8l4-4 4 4 M16 20V4 M12 16l4 4 4-4',
  close: 'M6 6l12 12 M6 18L18 6',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  edit: 'M14 5l5 5 M4 20l1-6L16 3l5 5-11 11z',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  reset: 'M3 10a9 9 0 1 1 2 8 M3 4v6h6',
  send: 'M22 2L9 15 M22 2l-7 20-4-9-9-4z',
  check: 'M5 12l4 4L19 6',
  upload: 'M12 16V3 M7 8l5-5 5 5 M4 16v5h16v-5',
  download: 'M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4',
  file: 'M14 2H5v20h14V7z M14 2v5h5 M8 12h8 M8 16h8',
  warning: 'M12 3L2 21h20z M12 9v5 M12 17h.01',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1'
}
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="app-icon">
    <path :d="paths[name] || paths.grid" />
  </svg>
</template>
