import test from 'node:test'
import assert from 'node:assert/strict'
import { validateMessageFields } from '../src/messageForm.js'

const validFields = { typeId: 'type', categoryId: 'category', statusId: 'status', functionalityId: 'functionality' }

test('validateMessageFields accepts exact minimum and maximum lengths', () => {
  assert.equal(validateMessageFields({ ...validFields, title: 't'.repeat(5), content: 'c'.repeat(5) }), '')
  assert.equal(validateMessageFields({ ...validFields, title: 't'.repeat(1000), content: 'c'.repeat(2000) }), '')
})

test('validateMessageFields rejects title and content above their maximums', () => {
  assert.match(validateMessageFields({ ...validFields, title: 't'.repeat(1001), content: 'c'.repeat(5) }), /título.*1000/)
  assert.match(validateMessageFields({ ...validFields, title: 't'.repeat(5), content: 'c'.repeat(2001) }), /contenido.*2000/)
})

test('validateMessageFields counts the trimmed value and rejects below minimum', () => {
  assert.match(validateMessageFields({ ...validFields, title: ` ${'t'.repeat(5)} `, content: 'c'.repeat(5) }), /^$/)
  assert.match(validateMessageFields({ ...validFields, title: 't'.repeat(4), content: 'c'.repeat(5) }), /título.*5/)
})
