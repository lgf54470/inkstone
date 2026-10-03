#!/usr/bin/env node
/**
 * Locates which declaration file(s) provide the member signature TypeScript
 * resolves on a given expression — decisive evidence when a global interface
 * (Element, HTMLElement, Document, EventTarget…) has merged with an unwanted
 * declaration and a built-in method suddenly accepts the wrong argument types.
 *
 * Usage:
 *   node probe-member.mjs <project-dir> <snippet-file>
 *
 * The snippet file must contain ONE statement shaped like:
 *   <expression>.<member>(arg)
 * Example snippet line:
 *   document.body.append(container)
 *
 * Resolution uses the project's own tsconfig, so its include/exclude is honored:
 * a file excluded from tsconfig never participates.
 */
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const [, , projectArg, snippetArg] = process.argv
if (!projectArg || !snippetArg) {
  console.error('usage: node probe-member.mjs <project-dir> <snippet-file>')
  process.exit(2)
}
const projectDir = path.resolve(projectArg)
const snippetPath = path.resolve(snippetArg)
const require = createRequire(path.join(projectDir, 'package.json'))
const tsLib = require('typescript')

const configPath = tsLib.findConfigFile(projectDir, tsLib.sys.fileExists, 'tsconfig.json')
if (!configPath) {
  console.error(`no tsconfig.json under ${projectDir}`)
  process.exit(2)
}
const configFile = tsLib.readConfigFile(configPath, tsLib.sys.readFile)
const parsed = tsLib.parseJsonConfigFileContent(configFile.config, tsLib.sys, projectDir)

const source = tsLib.createSourceFile(
  '__probe__.ts',
  fs.readFileSync(snippetPath, 'utf8'),
  tsLib.ScriptTarget.ESNext,
  true,
)
const statement = source.statements.find(
  (node) => tsLib.isExpressionStatement(node) && tsLib.isCallExpression(node.expression),
)
if (!statement || !tsLib.isPropertyAccessExpression(statement.expression.expression)) {
  console.error('snippet must contain one call statement: <expression>.<member>(arg)')
  process.exit(2)
}
const probeExpression = statement.expression.expression.expression.getText(source)
const memberName = statement.expression.expression.name.text

const host = tsLib.createCompilerHost(parsed.options)
const originalGetSourceFile = host.getSourceFile.bind(host)
host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
  if (fileName === '__probe__.ts') return source
  return originalGetSourceFile(fileName, languageVersion, onError, shouldCreate)
}
const program = tsLib.createProgram({
  rootNames: [...parsed.fileNames, '__probe__.ts'],
  options: parsed.options,
  host,
})
const checker = program.getTypeChecker()
const boundSnippet = program.getSourceFile('__probe__.ts') ?? source
const boundCall = boundSnippet.statements
  .filter(tsLib.isExpressionStatement)
  .map((node) => node.expression)
  .filter(tsLib.isCallExpression)[0]
const receiverNode = boundCall.expression.expression
const receiverType = checker.getTypeAtLocation(receiverNode)
const symbol = receiverType.getProperty(memberName)

if (!symbol) {
  console.error(`no member "${memberName}" on type ${checker.typeToString(receiverType)}`)
  process.exit(1)
}

console.log(`# ${probeExpression} . ${memberName}`)
console.log(`resolved type: ${checker.typeToString(receiverType)}`)
for (const decl of symbol.getDeclarations() ?? []) {
  const sf = decl.getSourceFile()
  const pos = sf.getLineAndCharacterOfPosition(decl.getStart())
  console.log(`${sf.fileName}:${pos.line + 1}:${pos.character + 1}  [${tsLib.SyntaxKind[decl.kind]}]`)
}

console.log('\n# declaration files defining this member on a same-named interface:')
for (const sf of program.getSourceFiles()) {
  if (!sf.isDeclarationFile) continue
  let hits = 0
  const visit = (node) => {
    if (tsLib.isPropertySignature(node) || tsLib.isMethodSignature(node)) {
      if (node.name && tsLib.isIdentifier(node.name) && node.name.text === memberName) hits += 1
    }
    tsLib.forEachChild(node, visit)
  }
  tsLib.forEachChild(sf, visit)
  if (hits > 0) console.log(`- ${sf.fileName} (${hits} signature(s))`)
}
