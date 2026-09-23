// AGENTS.md rule 1 of the toolbar section: an expansion panel inside a full screen
// toolbar may not grow it, and the audit that concluded so is run by the browser
// gate rather than remembered. This gate keeps that audit from going stale: it finds
// every full screen surface root in src/client by the class that makes it one
// (`app-viewport-fixed`, or `fixed inset-0`), and requires each of them to be either
// opened and swept by scripts/e2e-visual.mjs, or covered by a named assertion in it,
// with the reason written down here. Both directions fail: a new surface nobody
// swept, and an entry for a surface that is gone.
//
// The link to the gate is the surface name the sweep lists, or the literal
// assertion text a scenario prints, so renaming either one on one side alone
// fails rather than silencing a surface that no longer has a reader.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = 'src/client'
const GATE = 'scripts/e2e-visual.mjs'
const FULLSCREEN_CLASSES = ['app-viewport-fixed', 'fixed inset-0']

// Every surface root and where the browser gate reads it. `sweep` is the name the
// sweep lists for it; `checkedBy` is an assertion the gate prints for a surface the
// sweep cannot drive on its own — a list, because a surface root several overlays
// share (the modal shell) is read by one assertion per consumer. Either way the gate
// has to be the reader.
const SURFACES = [
  {
    file: 'src/client/features/graph/graph-panel/index.tsx',
    component: 'GraphPanel',
    sweep: 'graph',
  },
  {
    file: 'src/client/features/templates/template-gallery.tsx',
    component: 'TemplateGallery',
    sweep: 'template library',
  },
  {
    file: 'src/client/features/settings/settings-panel.tsx',
    component: 'SettingsPanel',
    sweep: 'settings',
  },
  {
    file: 'src/client/features/command/command-palette/index.tsx',
    component: 'CommandPalette',
    sweep: 'command palette',
  },
  {
    file: 'src/client/features/presentation/presentation-overlay.tsx',
    component: 'PresentationDialog',
    sweep: 'presentation',
  },
  {
    file: 'src/client/features/preview/lightbox.tsx',
    component: 'Lightbox',
    sweep: 'lightbox',
  },
  {
    file: 'src/client/components/overlay/drawer.tsx',
    component: 'Drawer',
    // The shell is swept where a person meets it: at the phone breakpoint, as the outline.
    sweep: 'outline drawer',
  },
  {
    file: 'src/client/components/overlay/modal.tsx',
    component: 'Modal',
    // The shell is a container, not a surface of its own, and three overlays take its full
    // screen variant: the mind map, whose scenario asserts the same two things (Escape
    // closes it, the keyboard reference does not grow the head) on the element this file
    // renders, the slides editor, whose scenario asserts the same pair from the control it
    // was opened from, the share center, which asserts that the variant covers the phone
    // breakpoint before it reads that element, and the full screen kanban board, whose top bar
    // the sweep drives instead. The names below are the assertions each consumer lives behind —
    // the board is covered by its own sweep entry, which is why it needs none.
    checkedBy: [
      'mindmap: opening the keyboard reference leaves the toolbar its size',
      'share: the center takes the phone breakpoint as a full screen surface',
    ],
  },
]

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) out = walk(target, out)
    else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) out.push(target)
  }
  return out
}

function relative(file) {
  return path.relative(process.cwd(), file).replaceAll('\\', '/')
}

// The class list of a JSX attribute, as written: a plain string, a template, or the
// raw text of an expression (`cn('app-viewport-fixed …', …)`) — enough to see the
// class that makes the element a surface, without evaluating anything.
function classNameText(node) {
  const attribute = node.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText() === 'className',
  )
  const initializer = attribute?.initializer
  if (!initializer) return ''
  if (ts.isStringLiteral(initializer)) return initializer.text
  return initializer.getText()
}

// The component the root is drawn in, so an entry names a surface rather than a line.
function enclosingComponent(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text
  }
  return ''
}

const failures = []
const found = []
for (const file of walk(path.resolve(ROOT))) {
  const text = fs.readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const classes = classNameText(node)
      const token = FULLSCREEN_CLASSES.find((candidate) => classes.includes(candidate))
      if (token) found.push({ file: relative(file), component: enclosingComponent(node), token })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

const key = (surface) => `${surface.file}#${surface.component}`
const declared = new Map(SURFACES.map((surface) => [key(surface), surface]))
const gateText = fs.readFileSync(GATE, 'utf8')
const swept = new Set([...gateText.matchAll(/name: '([^']+)'/g)].map((match) => match[1]))

for (const surface of found) {
  const entry = declared.get(key(surface))
  if (!entry) {
    failures.push(`${surface.file} draws a full screen surface in ${surface.component || '(anonymous)'} ("${surface.token}") that no gate reads; add it to scripts/e2e-visual.mjs and declare it here`)
    continue
  }
  if (entry.sweep && !swept.has(entry.sweep)) {
    failures.push(`${surface.file} declares the sweep name "${entry.sweep}", which ${GATE} does not list any more`)
  }
  if (entry.checkedBy) {
    const assertions = Array.isArray(entry.checkedBy) ? entry.checkedBy : [entry.checkedBy]
    for (const assertion of assertions) {
      if (!gateText.includes(assertion)) {
        failures.push(`${surface.file} is covered by an assertion ${GATE} no longer prints: ${assertion}`)
      }
    }
  }
}

const seen = new Set(found.map(key))
for (const surface of SURFACES) {
  if (!seen.has(key(surface))) {
    failures.push(`${surface.file}#${surface.component} no longer draws a full screen surface; remove its entry from this gate`)
  }
}

if (failures.length) {
  console.error(`surface coverage check failed (${failures.length}):`)
  failures.forEach((failure) => console.error(`  ${failure}`))
  process.exit(1)
}

console.log(`surface coverage check passed: all ${found.length} full screen surfaces are opened and read by ${GATE}`)
