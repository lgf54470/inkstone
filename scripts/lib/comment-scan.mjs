import ts from 'typescript'

/**
 * Every comment in a script file, in source order, read from the token tree rather than by matching
 * comment glyphs in the text.
 *
 * A text match cannot tell a comment from the same characters inside a string: `'/api/blog/*'`
 * followed by any later block comment looked like one long comment, so every real comment between
 * the two was never produced — and a comment the checker never sees is one it stops requiring to be
 * approved, which is the one direction a comment policy must not fail in. Tokens carry no such
 * ambiguity: the range helpers answer only for trivia a token really owns, so a `//` inside a string
 * or a template is not trivia in the first place.
 *
 * Both the checker and the allowlist generator read comments through this one function, so the
 * inventory they compare can never be built by a different rule than the check applies.
 */
export function commentsIn(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindOf(file))
  const found = new Map()
  visit(source)
  return [...found.values()].sort((left, right) => left.start - right.start)

  function visit(node) {
    const leading = ts.getLeadingCommentRanges(text, node.pos)
    const trailing = ts.getTrailingCommentRanges(text, node.end)
    for (const ranges of [leading, trailing]) {
      for (const range of ranges || []) {
        found.set(range.pos, { start: range.pos, text: text.slice(range.pos, range.end) })
      }
    }
    for (const child of node.getChildren(source)) visit(child)
  }
}

function scriptKindOf(file) {
  if (file.endsWith('.tsx') || file.endsWith('.jsx')) return ts.ScriptKind.TSX
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}
