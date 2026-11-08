// Validación compartida por creación y edición; el backend conserva la validación definitiva.
export function validateMessageFields(form) {
  const titleLength = form.title.trim().length
  const contentLength = form.content.trim().length
  if (titleLength < 5 || titleLength > 1000) return 'El título debe tener entre 5 y 1000 caracteres, sin contar espacios al inicio o al final.'
  if (contentLength < 5 || contentLength > 2000) return 'El contenido debe tener entre 5 y 2000 caracteres, sin contar espacios al inicio o al final.'
  if (!form.typeId || !form.categoryId || !form.statusId || !form.functionalityId) return 'Selecciona el tipo, la categoría, el estado y la funcionalidad.'
  return ''
}
