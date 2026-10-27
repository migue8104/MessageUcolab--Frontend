// Presentación de datos reales: un valor ausente nunca se interpreta como activo.
export function statusName(item) {
  const value = item?.status ?? item?.state
  return typeof value === 'object' ? value?.name || '' : value || ''
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
  return ['develop', 'testing', 'production'].includes(value) ? value : 'other'
}
