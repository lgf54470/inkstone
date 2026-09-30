export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/**
 * The `column LIKE ?n` comparison for each column, all bound to the same needle, with the ESCAPE
 * clause the escaped needle needs. Every caller binds a needle through `escapeLike`; without the
 * matching ESCAPE that backslash is just a character, so a search for `%` scans the whole table and
 * `_` matches anything — which is how three of these ended up written without it.
 */
export function likeAny(columns: readonly string[], placeholder: string): string {
  return columns.map((column) => `${column} LIKE ${placeholder} ESCAPE '\\'`).join(' OR ')
}
