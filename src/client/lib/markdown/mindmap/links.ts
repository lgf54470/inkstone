/**
 * Recognising a mind map node that is a link to another note.
 *
 * The link lives in the node's topic, written the way it would be written in
 * prose: `[[Target note]]`. That is the one place both body formats carry — the
 * outline format has no per-node fields, and the library's own `hyperLink` is
 * written for the open web (it renders an anchor that opens a new tab and is
 * dropped by the outline serializer), so neither was an option. A topic is
 * plain text to the library either way, so this round-trips.
 */

/** The whole topic, nothing around it: a topic that merely mentions a note stays text. */
const NODE_LINK_RE = /^\[\[([^[\]\n]{1,400})\]\]$/

/**
 * The wiki target a node points at, or null when the topic is not one. Matches
 * `parseWikiTarget`'s own input, so the result is handed straight to it.
 */
export function parseMindmapNodeLink(topic: string): string | null {
  const match = NODE_LINK_RE.exec(topic.trim())
  if (!match) return null
  const target = match[1]!.trim()
  return target.length > 0 ? target : null
}
