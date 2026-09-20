import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the dependency install actually lives. node_modules is frequently a symlink into
 * a shared or sibling checkout (worktrees, deduplicated installs), and Vite checks the real
 * path of every served file against `server.fs.allow` — without the dependency directory's
 * real path, the packages' own assets (the KaTeX fonts that katex/dist/katex.min.css
 * references) are answered with 403 in dev and the math falls back to a system font.
 *
 * @param {string} target
 * @returns {string | null}
 */
const resolveRealPath = (target) => (fs.existsSync(target) ? fs.realpathSync(target) : null);

const dependencyRealPath = resolveRealPath(path.join(projectRoot, 'node_modules'));

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    build: {
      chunkSizeWarningLimit: 1000,
    },
    server: {
      fs: {
        // Replaces Vite's default allow list, so the project root is named explicitly here.
        allow: [projectRoot, ...(dependencyRealPath ? [dependencyRealPath] : [])],
      },
    },
  },
  server: {
    port: 4321,
    host: true,
  },
});
