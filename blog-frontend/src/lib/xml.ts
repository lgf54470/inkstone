/** XML 文本转义：sitemap/feed 等动态 XML 端点共用 */
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    const table: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return table[ch]!
  })
}