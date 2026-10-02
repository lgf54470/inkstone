const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'INSERT INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE FROM',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'OUTER JOIN',
  'CROSS JOIN',
  'JOIN',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'UNION ALL',
  'UNION',
  'CREATE TABLE',
  'DROP TABLE',
  'ALTER TABLE',
  'DISTINCT',
  'BETWEEN',
  'LIKE',
  'IS NULL',
  'IS NOT NULL',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
]

const SQL_NEWLINE_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'OUTER JOIN',
  'CROSS JOIN',
  'JOIN',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'SET',
  'VALUES',
  'UNION ALL',
  'UNION',
]

function maskSqlLiterals(sql: string): { masked: string; placeholders: string[] } {
  const placeholders: string[] = []
  const literalRegex = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]+`|--[^\r\n]*|\/\*[\s\S]*?\*\/|[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+)/g
  const masked = sql.replace(literalRegex, (match) => {
    placeholders.push(match)
    return `___SQL_MASK_${placeholders.length - 1}___`
  })
  return { masked, placeholders }
}

function restoreSqlLiterals(text: string, placeholders: string[]): string {
  let result = text
  for (let i = 0; i < placeholders.length; i++) {
    result = result.replace(`___SQL_MASK_${i}___`, placeholders[i]!)
  }
  return result
}

function spaceSqlOperators(sql: string): string {
  let s = sql
  s = s.replace(/([a-zA-Z0-9_$])\s*(=|!=|<>|<=|>=|<|>)\s*([a-zA-Z0-9_$'"`])/g, '$1 $2 $3')
  s = s.replace(/,\s*/g, ', ')
  s = s.replace(/\s+/g, ' ')
  return s
}

export function formatSql(sql: string): string {
  const { masked, placeholders } = maskSqlLiterals(sql)
  let formatted = spaceSqlOperators(masked).trim()

  for (const kw of SQL_KEYWORDS) {
    const regex = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'gi')
    formatted = formatted.replace(regex, kw)
  }

  for (const kw of SQL_NEWLINE_KEYWORDS) {
    const regex = new RegExp(`\\s+(${kw.replace(/\s+/g, '\\s+')})\\b`, 'g')
    formatted = formatted.replace(regex, '\n$1')
  }

  return restoreSqlLiterals(formatted, placeholders).trim()
}
