import { describe, expect, it } from 'vitest'
import { GRAPH_FOLDER_PATH_SEPARATOR, folderIdsMatchingPath, folderPathsById } from './folder-path'

/**
 * A `path:` term and a legend row both name a folder, and a nested vault has two folders that can end
 * with the same word. What names a folder to a reader is where it sits — `Work/Notes`, not `Notes` — so
 * the path is worked out once here and every surface that says a folder's name says this (G-48).
 */
const shape = (id: string, name: string, parentId: string | null = null) => ({ id, name, parentId })

describe('where each folder sits (G-48)', () => {
  it('writes a nested folder as its ancestors joined by the separator', () => {
    const paths = folderPathsById([
      shape('work', 'Work'),
      shape('work-notes', 'Notes', 'work'),
      shape('work-notes-2024', '2024', 'work-notes'),
      shape('life', 'Life'),
      shape('life-notes', 'Notes', 'life'),
    ])
    expect(paths.get('work')).toBe('Work')
    expect(paths.get('work-notes')).toBe(['Work', 'Notes'].join(GRAPH_FOLDER_PATH_SEPARATOR))
    expect(paths.get('work-notes-2024')).toBe(['Work', 'Notes', '2024'].join(GRAPH_FOLDER_PATH_SEPARATOR))
    expect(paths.get('life-notes')).toBe(['Life', 'Notes'].join(GRAPH_FOLDER_PATH_SEPARATOR))
  })

  it('names folders in the order they were handed over, whatever depth they are at', () => {
    const paths = folderPathsById([shape('leaf', 'Notes', 'root'), shape('root', 'Work')])
    expect([...paths.keys()]).toEqual(['leaf', 'root'])
    expect(paths.get('leaf')).toBe('Work/Notes')
    expect(paths.get('root')).toBe('Work')
  })

  it('stops walking up at a parent cycle instead of looping or naming itself forever', () => {
    const paths = folderPathsById([shape('a', 'A', 'b'), shape('b', 'B', 'a')])
    expect(paths.get('a')).toBe('B/A')
    expect(paths.get('b')).toBe('A/B')
  })

  it('treats a parent that is not in the list as the top of the line', () => {
    const paths = folderPathsById([shape('orphan', 'Orphan', 'gone')])
    expect(paths.get('orphan')).toBe('Orphan')
  })

})

describe('which folders a path term reaches (G-48)', () => {
  it('selects the folders a term names, by path rather than by the last word alone', () => {
    const paths = folderPathsById([
      shape('work', 'Work'),
      shape('work-notes', 'Notes', 'work'),
      shape('life', 'Life'),
      shape('life-notes', 'Notes', 'life'),
    ])
    expect(folderIdsMatchingPath('Work/Notes', paths)).toEqual(['work-notes'])
    expect(folderIdsMatchingPath('notes', paths).sort()).toEqual(['life-notes', 'work-notes'])
    expect(folderIdsMatchingPath('work', paths).sort()).toEqual(['work', 'work-notes'])
    expect(folderIdsMatchingPath('nowhere', paths)).toEqual([])
  })

  it('answers in a stable order so the same term binds the same sql twice', () => {
    const paths = folderPathsById([shape('z', 'Zest'), shape('a', 'Apple'), shape('m', 'Amlar')])
    expect(folderIdsMatchingPath('a', paths)).toEqual(['a', 'm'])
    expect(folderIdsMatchingPath('st', paths)).toEqual(['z'])
  })
})
