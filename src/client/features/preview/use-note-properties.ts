import { useMemo, useState } from 'react'
import { deleteFrontMatterProperty, parseFrontMatter, renameFrontMatterProperty, upsertFrontMatterProperty } from '@shared/markdown-utils'
import { useNotes } from '../../store/notes'

export function isTagKey(key: string) {
  return key === 'tags' || key === 'tag'
}

export function getTagsList(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.filter((item): item is string => typeof item === 'string').map((item) => item.replace(/^#/, ''))
  }
  if (typeof val === 'string' && val.trim()) {
    return val.replace(/^\[|\]$/g, '').split(/[,\s]+/).filter(Boolean).map((item) => item.replace(/^#/, ''))
  }
  return []
}

function normalizePropertyValue(key: string, raw: string): unknown {
  const val = raw.trim()
  if (isTagKey(key)) return val ? [String(val).replace(/^#/, '')] : []
  if (val === 'true') return true
  if (val === 'false') return false
  return val
}

function useTagEditState(handleUpdate: (key: string, value: unknown) => void, frontMatterData: Record<string, unknown>) {
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTagText, setNewTagText] = useState('')
  const currentTags = getTagsList(frontMatterData.tags ?? frontMatterData.tag)

  const handleRemoveTag = (tagName: string) => {
    const nextTags = currentTags.filter((tag) => tag.toLowerCase() !== tagName.toLowerCase())
    handleUpdate('tags', nextTags)
  }

  const handleAddTag = (tagName: string) => {
    const clean = tagName.trim().replace(/^#/, '')
    if (!clean) {
      setIsAddingTag(false)
      return
    }
    if (!currentTags.some((tag) => tag.toLowerCase() === clean.toLowerCase())) {
      handleUpdate('tags', [...currentTags, clean])
    }
    setNewTagText('')
    setIsAddingTag(false)
  }

  const beginAddTag = () => {
    setIsAddingTag(true)
    setNewTagText('')
  }

  return { isAddingTag, setIsAddingTag, newTagText, setNewTagText, handleRemoveTag, handleAddTag, beginAddTag }
}

function usePropertyAddState(handleUpdate: (key: string, value: unknown) => void) {
  const [isAddingProperty, setIsAddingProperty] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const handleCommitNewProperty = () => {
    const k = newKey.trim()
    if (!k) {
      setIsAddingProperty(false)
      return
    }
    handleUpdate(k, normalizePropertyValue(k, newValue))
    setNewKey('')
    setNewValue('')
    setIsAddingProperty(false)
  }

  const beginAddProperty = () => {
    setIsAddingProperty(true)
    setNewKey('')
    setNewValue('')
  }

  return { isAddingProperty, setIsAddingProperty, newKey, setNewKey, newValue, setNewValue, handleCommitNewProperty, beginAddProperty }
}

export function useNoteProperties(noteId: string | null, content: string) {
  const allStoreTags = useNotes((s) => s.tags ?? [])
  const tagColors = useMemo(() => new Map(allStoreTags.map((item) => [item.name, item.color])), [allStoreTags])
  const frontMatter = useMemo(() => parseFrontMatter(content), [content])
  const properties = useMemo(() => Object.entries(frontMatter.data), [frontMatter.data])

  const [isExpanded, setIsExpanded] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [renamedKey, setRenamedKey] = useState('')

  const applyContentChange = (nextContent: string) => {
    if (!noteId || nextContent === content) return
    useNotes.getState().editContent(noteId, nextContent)
  }

  const handleUpdate = (key: string, value: unknown) => {
    applyContentChange(upsertFrontMatterProperty(content, key, value))
  }

  const handleDelete = (key: string) => {
    applyContentChange(deleteFrontMatterProperty(content, key))
  }

  const handleRename = (oldKey: string, nextKey: string) => {
    const trimmed = nextKey.trim()
    if (!trimmed || trimmed === oldKey) {
      setEditingKey(null)
      return
    }
    applyContentChange(renameFrontMatterProperty(content, oldKey, trimmed))
    setEditingKey(null)
  }

  const tagEdits = useTagEditState(handleUpdate, frontMatter.data)
  const propertyAdd = usePropertyAddState(handleUpdate)

  return {
    properties, tagColors,
    isExpanded, setIsExpanded,
    editingKey, setEditingKey, renamedKey, setRenamedKey,
    handleUpdate, handleDelete, handleRename,
    ...tagEdits,
    ...propertyAdd,
  }
}

export type NotePropertiesBundle = ReturnType<typeof useNoteProperties>