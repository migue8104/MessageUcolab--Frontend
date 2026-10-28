// Presentación de datos reales: un valor ausente nunca se interpreta como activo.
const catalogLabels = {
  active: 'Activo', inactive: 'Inactivo', functional: 'Funcional', technical: 'Técnico',
  information: 'Información', confirmation: 'Confirmación', warning: 'Advertencia', debug: 'Depuración',
  english: 'Inglés', spanish: 'Español', french: 'Francés'
}

export function catalogLabel(value) {
  const name = typeof value === 'object' ? value?.name || '' : value || ''
  return catalogLabels[name.trim().toLowerCase()] || name
}

export function statusName(item) {
  const value = item?.status ?? item?.state
  return catalogLabel(value)
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function asList(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []
}

export function environmentTone(name) {
  const value = String(name || '').trim().toLowerCase()
  if (['production', 'produccion', 'producción'].includes(value)) return 'production'
  return ['develop', 'testing', 'production'].includes(value) ? value : 'other'
}

export function environmentName(name) {
  return environmentTone(name) === 'production' ? 'Produccion' : name
}
