// Validación compartida por creación y edición; el backend conserva la validación definitiva.
export function validateMessageFields(form) {
  const titleLength = form.title.trim().length
  const contentLength = form.content.trim().length
  if (titleLength < 10 || titleLength > 50) return 'El título debe tener entre 10 y 50 caracteres, sin contar espacios al inicio o al final.'
  if (contentLength < 10 || contentLength > 100) return 'El contenido debe tener entre 10 y 100 caracteres, sin contar espacios al inicio o al final.'
  if (!form.typeId || !form.categoryId || !form.statusId || !form.functionalityId) return 'Selecciona el tipo, la categoría, el estado y la funcionalidad.'
  return ''
}
