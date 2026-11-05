import test from 'node:test'
import assert from 'node:assert/strict'
import { validateMessageFields } from '../src/messageForm.js'

const validFields = { typeId: 'type', categoryId: 'category', statusId: 'status', functionalityId: 'functionality' }

test('validateMessageFields accepts exact minimum and maximum lengths', () => {
  assert.equal(validateMessageFields({ ...validFields, title: 't'.repeat(10), content: 'c'.repeat(10) }), '')
  assert.equal(validateMessageFields({ ...validFields, title: 't'.repeat(200), content: 'c'.repeat(500) }), '')
})

test('validateMessageFields rejects title and content above their maximums', () => {
  assert.match(validateMessageFields({ ...validFields, title: 't'.repeat(201), content: 'c'.repeat(10) }), /título.*200/)
  assert.match(validateMessageFields({ ...validFields, title: 't'.repeat(10), content: 'c'.repeat(501) }), /contenido.*500/)
})

test('validateMessageFields counts the trimmed value and rejects below minimum', () => {
  assert.match(validateMessageFields({ ...validFields, title: ` ${'t'.repeat(10)} `, content: 'c'.repeat(10) }), /^$/)
  assert.match(validateMessageFields({ ...validFields, title: 't'.repeat(9), content: 'c'.repeat(10) }), /título.*10/)
})
