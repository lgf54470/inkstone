import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, UserConfigFnPromise } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { inkstonePwa } from './pwa.config.ts'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const ephemeralDevState = process.env.INKSTONE_EPHEMERAL_DEV === '1'

/**
 * Where the dependency install actually lives. node_modules is frequently a symlink into
 * a shared or sibling checkout (worktrees, deduplicated installs), and Vite checks the real
 * path of every served file against `server.fs.allow` — without the dependency directory's
 * real path, the packages' own assets (the @fontsource woff2 that
 * src/client/styles/inter.css references, KaTeX's font files) are answered with 403 in dev.
 */
const resolveRealPath = (target: string): string | null =>
  fs.existsSync(target) ? fs.realpathSync(target) : null

const dependencyRealPath = resolveRealPath(r('./node_modules'))

const normalizeModuleId = (id: string) => id.replace(/\\/g, '/')


const preservesOnDemandBoundary = (id: string) => {
  const path = normalizeModuleId(id)
  // Keep optional preview renderers and their language modules behind dynamic-import boundaries.
  return (
    /\/node_modules\/(?:mermaid|@mermaid-js\/[^/]+|cytoscape|cytoscape-cose-bilkent|elkjs|dagre-d3-es|d3-[^/]+)\//.test(
      path,
    ) ||
    /\/node_modules\/@lezer\/(?!common\/|highlight\/|lr\/|markdown\/)/.test(path) ||
    /\/node_modules\/prismjs\/components\/prism-(?!core(?:\.js)?$)/.test(path)
  )
}

const isLucideModule = (id: string) =>
  normalizeModuleId(id).includes('/node_modules/lucide-react/')

const isReactModule = (id: string) => {
  const path = normalizeModuleId(id)
  return (
    path.includes('/node_modules/') &&
    /react-dom|\/react\/|scheduler|use-sync-external-store|zustand/.test(path)
  )
}

const katexWoff2Only = (): Plugin => ({
  name: 'inkstone:katex-woff2-only',
  enforce: 'pre',
  transform(code, id) {
    const path = normalizeModuleId(id).split('?', 1)[0]
    if (!path.endsWith('/node_modules/katex/dist/katex.min.css')) return null


    return code.replace(
      /,\s*url\([^)]*\.woff\)\s*format\((["'])woff\1\),\s*url\([^)]*\.ttf\)\s*format\((["'])truetype\2\)/g,
      '',
    )
  },
})

const EXCALIDRAW_FONT_SOURCE = 'node_modules/@excalidraw/excalidraw/dist/prod/fonts'
const EXCALIDRAW_FONT_DESTINATION = 'public/fonts'
const EXCALIDRAW_FONT_MARKER = `${EXCALIDRAW_FONT_DESTINATION}/.materialized`

/**
 * The whiteboard library resolves the fonts it draws with at runtime, from paths
 * relative to the app root (`/fonts/<family>/<file>`), and falls back to its own CDN
 * when they are missing — which a self-hosted instance's CSP blocks, leaving the board
 * drawn with system fonts instead of the hand-drawn ones. The package's font files are
 * therefore materialized into public/ (generated output, gitignored) before dev and
 * build; the copy is skipped while it is current, and refreshed when the package moves.
 */
const excalidrawFonts = (): Plugin => {
  const materialize = () => {
    const source = r(`./${EXCALIDRAW_FONT_SOURCE}`)
    const destination = r(`./${EXCALIDRAW_FONT_DESTINATION}`)
    if (!fs.existsSync(source)) return
    const stamp = `${JSON.parse(fs.readFileSync(r('./node_modules/@excalidraw/excalidraw/package.json'), 'utf8')).version}`
    const marker = r(`./${EXCALIDRAW_FONT_MARKER}`)
    if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === stamp) return
    fs.rmSync(destination, { recursive: true, force: true })
    fs.cpSync(source, destination, { recursive: true })
    fs.writeFileSync(marker, stamp)
  }
  return {
    name: 'inkstone:excalidraw-fonts',
    buildStart: materialize,
    configureServer: materialize,
  }
}

const getVendorChunkName = (id: string) => {
  if (!id.includes('node_modules') || preservesOnDemandBoundary(id)) return null

  const path = normalizeModuleId(id)

  if (path.includes('/katex/') && !path.includes('.css')) return 'vendor-katex'
  if (/@codemirror|@lezer|crelt|style-mod|w3c-keyname/.test(path)) return 'vendor-editor'
  if (/markdown-it|mdurl|entities|linkify-it|punycode|uc\.micro/.test(path)) {
    return 'vendor-markdown'
  }
  if (isReactModule(id)) return 'vendor-react'

  return null
}

const config: UserConfigFnPromise = async ({ mode, command }) => ({
  plugins: [
    react(),
    katexWoff2Only(),
    excalidrawFonts(),
    tailwindcss(),
    inkstonePwa(),
    ...(mode === 'demo'
      ? []
      : [
          (await import('@cloudflare/vite-plugin')).cloudflare({
            configPath: mode === 'kv' ? './wrangler.kv.toml' : undefined,
            persistState: !ephemeralDevState,
            ...(command === 'serve' && mode !== 'ai'
              ? { config: (worker: { ai?: unknown }) => { delete worker.ai } }
              : {}),
          }),
        ]),
  ],

  resolve: {
    alias: [
      { find: /^katex$/, replacement: r('./node_modules/katex/dist/katex.mjs') },
      { find: '@', replacement: r('./src/client') },
      { find: '@shared', replacement: r('./src/shared') },
    ],
  },

  server: {

    port: 7712,
    strictPort: false,

    fs: {
      // Replaces Vite's default allow list, so the project root is named explicitly here.
      allow: [r('./'), ...(dependencyRealPath ? [dependencyRealPath] : [])],
    },
  },

  preview: {
    port: 7713,
  },

  build: {
    ...(mode === 'demo' ? { outDir: 'dist/demo' } : {}),
    target: 'esnext',
    sourcemap: false,
    chunkSizeWarningLimit: 250,
    cssMinify: 'lightningcss',
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
      output: {
        minify: true,
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: (id) => isReactModule(id),
              priority: 40,
            },
            {
              name: 'initial',
              test: /[\\/]src[\\/]client[\\/]/,
              tags: ['$initial'],
              priority: 35,
            },
            {
              name: 'vendor-katex',
              test: (id) => (id === 'katex' || normalizeModuleId(id).includes('/katex/')) && !id.includes('.css'),
              priority: 30,
            },
            {
              name: 'vendor-icons',
              test: isLucideModule,
              priority: 25,
            },
            {
              name: getVendorChunkName,
              priority: 20,
            },
          ],
        },
      },
    },
  },
})

export default config
