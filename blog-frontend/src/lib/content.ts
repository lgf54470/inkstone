const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/

/** Strip a leading YAML frontmatter block from markdown content, if present. */
export function stripFrontmatter(content: string): string {
  const match = content.match(FRONTMATTER_PATTERN)
  return match ? content.slice(match[0].length) : content
}

/** Whether a cover URL points at an SVG (rendered unstyled instead of cropped like photos). */
export function isSvgCoverUrl(coverUrl: string | null | undefined): boolean {
  if (!coverUrl) return false
  const lower = coverUrl.toLowerCase()
  return lower.endsWith('.svg') || lower.includes('.svg?')
}