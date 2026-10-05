import { describe, expect, it } from 'vitest'
import { collectCoreFiles } from '../../pwa.config.ts'

/**
 * The offline shell has to cover the modules the signed-in boot walks through, and the bundler gives
 * the app-shell chunk no facade at all — it is a merged chunk named after one of its modules. The
 * matcher used to test `facadeModuleId.endsWith(...)`, so five paths that did not even exist matched
 * nothing, the whole thing degraded to the 12 document chunks, and it printed a warning nobody read.
 *
 * These cases hold both halves of the fix: matching by the modules a chunk actually contains, and
 * refusing the build when a boot module ends up in no chunk at all.
 */
function chunk(fileName: string, moduleIds: string[], imports: string[] = []) {
  return { type: 'chunk', fileName, code: '', isEntry: false, imports, facadeModuleId: null, moduleIds, viteMetadata: { importedCss: new Set<string>() } }
}

const ROOT = '/home/dev/inkstone'
const bundle = (extra: Record<string, unknown> = {}) => ({
  'index.html': { type: 'asset', fileName: 'index.html', source: '<html></html>' },
  'assets/initial-abc.js': chunk('assets/initial-abc.js', [`${ROOT}/src/client/main.tsx`], ['assets/app-def.js']),
  'assets/app-def.js': chunk('assets/app-def.js', [`${ROOT}/src/client/app.tsx`]),
  'assets/shell-ghi.js': chunk('assets/shell-ghi.js', [`${ROOT}/src/client/features/shell/app-shell.tsx`, `${ROOT}/src/client/features/shell/resizer.tsx`]),
  'assets/workspace-jkl.js': chunk('assets/workspace-jkl.js', [`${ROOT}/src/client/features/workspace/index.ts`]),
  'assets/en-US-mno.js': chunk('assets/en-US-mno.js', [`${ROOT}/src/shared/locales/en-US/index.ts`]),
  'assets/zh-CN-pqr.js': chunk('assets/zh-CN-pqr.js', [`${ROOT}/src/shared/locales/zh-CN/index.ts`]),
  'assets/mermaid-stu.js': chunk('assets/mermaid-stu.js', [`${ROOT}/node_modules/mermaid/dist/mermaid.core.mjs`]),
  ...extra,
} as never)

describe('offline shell coverage', () => {
  it('precaches the boot modules even when a chunk has no facade at all', () => {
    const urls = collectCoreFiles(bundle())
    for (const expected of ['assets/app-def.js', 'assets/shell-ghi.js', 'assets/workspace-jkl.js', 'assets/en-US-mno.js', 'assets/zh-CN-pqr.js'])
      expect(urls, expected).toContain(expected)
  })

  it('does not sweep in a lazy library that holds none of the boot modules', () => {
    expect(collectCoreFiles(bundle())).not.toContain('assets/mermaid-stu.js')
  })

  it('refuses the build when a boot module lands in no chunk', () => {
    const missingShell = bundle()
    for (const key of Object.keys(missingShell)) {
      if (key === 'assets/shell-ghi.js') delete missingShell[key]
    }
    expect(() => collectCoreFiles(missingShell as never)).toThrow(/features\/shell/)
  })
})
