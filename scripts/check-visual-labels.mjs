/**
 * The browser gates find a control by the words the app's own resources give it, and those words were
 * hand-copied into the gate files. That copy is what M5b was: `music.search_history` was reworded in the
 * app while the gate still carried the older wording, so `assertMusicSearchClear` built a selector that
 * could never match and the assertion failed for the wrong reason. No other gate can see that drift —
 * `i18n:check` compares the two languages with each other, never with the gate — so this one reads
 * every label list in the two gate files, requires each string to be one the resources carry today (in
 * either language), and requires each `localeLabel('key')` to name a key both bundles hold.
 *
 * What it cannot do: it does not know which entry a string belongs to (many of the lists name words
 * that several keys share), so an entry that wants a rename to follow automatically asks for its key by
 * name — `localeLabel('music.search_history')` in `scripts/e2e-visual.mjs`. An entry that keeps its own
 * list is a pointer this check verifies on every run: that is what makes a stale one fail loudly here
 * instead of quietly in the browser, and it is why the string has to still be one the resources carry.
 *
 * Text that is deliberately not resource copy — a fixture name, a structural word, a template's leading
 * text — belongs in the table below with its reason. It is empty on purpose: every label in the two
 * files is a resource string today, and the next one that is not has to say why.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GATE_FILES = ['scripts/e2e-visual.mjs', 'scripts/e2e-harness.mjs']
const LOCALES = ['zh-CN', 'en-US']
const RESOURCE_ROOT = 'src/shared/locales'

const NOT_RESOURCE_COPY = new Map([])

// The resources, read a file at a time: the index module the app imports leaves the extensions off its
// own imports (Node cannot resolve those), while each page of it is a plain object literal.
const bundles = { 'zh-CN': {}, 'en-US': {} }
for (const locale of LOCALES) {
  const dir = path.join(ROOT, RESOURCE_ROOT, locale)
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.ts') || file === 'index.ts') continue
    Object.assign(bundles[locale], (await import(pathToFileURL(path.join(dir, file)).href)).messages)
  }
}
const withText = new Map()
for (const locale of LOCALES) {
  for (const [key, text] of Object.entries(bundles[locale])) {
    const list = withText.get(text) ?? []
    list.push(`${locale}:${key}`)
    withText.set(text, list)
  }
}

/** Every top-level label list in a gate file: an object of them, and a bare array. */
function labelLists(source) {
  const lists = []
  for (const match of source.matchAll(/^const (\w*LABELS\w*) = \{$/gm)) {
    const from = match.index + match[0].length
    const to = source.indexOf('\n}\n', from)
    if (to > from) lists.push({ name: match[1], body: source.slice(from, to) })
  }
  for (const match of source.matchAll(/^const (\w*LABELS\w*) = \[([\s\S]*?)\]$/gm))
    lists.push({ name: match[1], body: match[2] })
  return lists
}

// The lists carry notes about what each read is for, and an English possessive reads to a quote scan as
// the start of a string ("the list's own box" opened one that ran into the next apostrophe). The notes
// are dropped before the strings are read; nothing else in a label list is a `//` comment.
function withoutNotes(body) {
  return body
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

const problems = []
let checked = 0
for (const file of GATE_FILES) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8')
  for (const list of labelLists(source)) {
    const body = withoutNotes(list.body)
    // An entry that names its key is checked as a key, not as text: its arguments are its own call.
    const copied = body.replace(/\b(localeLabel|localePrefix)\([^)]*\)/g, '')
    for (const [, text] of copied.matchAll(/'([^']*)'/g)) {
      checked++
      if (withText.has(text)) continue
      const reason = NOT_RESOURCE_COPY.get(`${list.name}:${text}`)
      if (reason) continue
      problems.push(`${file} ${list.name}: ${JSON.stringify(text)} is not a string the resources carry`)
    }
    for (const [, keys] of body.matchAll(/localeLabel\(([^)]*)\)/g)) {
      for (const [, key] of keys.matchAll(/'([^']*)'/g)) {
        checked++
        const missing = LOCALES.filter((locale) => bundles[locale][key] === undefined)
        if (missing.length > 0) problems.push(`${file} ${list.name}: no ${missing.join(' and ')} resource for ${key}`)
      }
    }
  }
}

if (problems.length > 0) {
  console.error('visual label check failed: a label no longer matches a string the resources carry')
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('  derive it (localeLabel(\'key\')) or register it in NOT_RESOURCE_COPY with the reason')
  process.exit(1)
}
console.log(`visual label check passed: ${checked} labels are strings the resources carry today`)
