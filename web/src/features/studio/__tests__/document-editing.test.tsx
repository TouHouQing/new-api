/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, test } from 'vitest'

import { studioProjectSchema } from '../local-projects'
import {
  studioDocumentForText,
  studioDocumentSchema,
  studioDocumentText,
} from '../studio-document'
import { StudioDocumentEditor } from '../studio-document-editor'
import { addStudioNode, createStudioProject } from '../workspace'

test('formatted draft survives project serialization and keeps model input as plain text', () => {
  const project = addStudioNode(
    createStudioProject('Draft', 'draft'),
    'text',
    'script'
  )
  const textDocument = [
    {
      kind: 'heading' as const,
      text: '<script>alert(1)</script>',
      bold: true,
      italic: false,
      color: '#334155',
    },
    {
      kind: 'bullet' as const,
      text: 'Keep approved dialogue',
      bold: false,
      italic: true,
      color: '#64748b',
    },
  ]
  project.nodes[0].data.textDocument = textDocument
  project.nodes[0].data.prompt = studioDocumentText(textDocument)
  const reopened = studioProjectSchema.parse(
    JSON.parse(JSON.stringify(project))
  )
  expect(reopened.nodes[0].data.textDocument).toEqual(textDocument)
  expect(reopened.nodes[0].data.prompt).toBe(
    '<script>alert(1)</script>\nKeep approved dialogue'
  )
  expect(studioDocumentForText('AI changed draft', textDocument)[0].text).toBe(
    'AI changed draft'
  )
})

test('format and text edits have a visible preview and formatting can be undone', () => {
  function Host() {
    const [value, setValue] = useState(studioDocumentForText('My story'))
    return <StudioDocumentEditor value={value} onChange={setValue} />
  }
  render(<Host />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Block style' }), {
    target: { value: 'heading' },
  })
  expect(screen.getByRole('heading', { name: 'My story' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
  expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Undo formatting' }))
  expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add block' }))
  expect(screen.getAllByRole('textbox')).toHaveLength(2)
})

test('document rejects aggregate overflow and script is rendered as text', () => {
  expect(
    studioDocumentSchema.safeParse([
      { ...studioDocumentForText('A')[0], id: 'duplicate' },
      { ...studioDocumentForText('B')[0], id: 'duplicate' },
    ]).success
  ).toBe(false)
  expect(
    studioDocumentSchema.safeParse([
      { ...studioDocumentForText('x'.repeat(20000))[0] },
      { ...studioDocumentForText('x'.repeat(20000))[0] },
    ]).success
  ).toBe(false)
  render(
    <StudioDocumentEditor
      value={studioDocumentForText('<script>danger()</script>')}
      onChange={() => {}}
    />
  )
  expect(document.querySelector('script')).toBeNull()
  expect(
    screen.getByText('<script>danger()</script>', { selector: 'p' })
  ).toBeVisible()
})
