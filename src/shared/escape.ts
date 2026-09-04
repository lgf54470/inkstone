/**
 * HTML-escape untrusted text (all five metacharacters: & < > " ').
 * Single canonical implementation shared by client and worker so escaping
 * semantics never drift between layers.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}