import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('./src/client'),
      '@shared': resolve('./src/shared'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: ['src/worker/lib/request.test.ts', 'src/client/demo/backend.test.ts', 'src/client/demo/backend-music.test.ts', 'src/worker/lib/obsidian-import.test.ts', 'tests/import-transfer.test.ts', 'tests/notes-routes.test.ts', 'tests/share-routes.test.ts', 'tests/blog-routes.test.ts', 'tests/music-public-routes.test.ts', 'tests/music-routes.test.ts', 'tests/music-webdav-routes.test.ts', 'tests/files-routes.test.ts', 'tests/backup.test.ts', 'tests/mcp-writes.test.ts', 'tests/attachment-isolation.test.ts', 'tests/auth-routes.test.ts', 'tests/sync-routes.test.ts', 'tests/link-checker.test.ts', 'tests/community-templates-routes.test.ts', 'tests/board-library-routes.test.ts',
          // Only on this side of the merge: dev never had these three files.
          'tests/music-playlist-share.test.ts',
          'tests/music-bundle-transfer.test.ts',
          'tests/offline-audio-sw.test.ts',
          'tests/visit-aggregates.test.ts',
          'tests/share-visit-retention.test.ts',
          'tests/blog-visit-cleanup.test.ts',
          'tests/blog-visit-retention.test.ts',
          'tests/blog-visit-guards.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/worker/lib/request.test.ts', 'src/client/demo/backend.test.ts', 'src/client/demo/backend-music.test.ts', 'src/worker/lib/obsidian-import.test.ts', 'tests/import-transfer.test.ts', 'tests/notes-routes.test.ts', 'tests/share-routes.test.ts', 'tests/blog-routes.test.ts', 'tests/music-public-routes.test.ts', 'tests/music-routes.test.ts', 'tests/music-webdav-routes.test.ts', 'tests/files-routes.test.ts', 'tests/backup.test.ts', 'tests/mcp-writes.test.ts', 'tests/attachment-isolation.test.ts', 'tests/auth-routes.test.ts', 'tests/sync-routes.test.ts', 'tests/link-checker.test.ts', 'tests/community-templates-routes.test.ts', 'tests/board-library-routes.test.ts',
          'tests/music-playlist-share.test.ts',
          'tests/music-bundle-transfer.test.ts',
          'tests/offline-audio-sw.test.ts',
          'tests/visit-aggregates.test.ts',
          'tests/share-visit-retention.test.ts',
          'tests/blog-visit-cleanup.test.ts',
          'tests/blog-visit-retention.test.ts',
          'tests/blog-visit-guards.test.ts'],
        },
      },
    ],
  },
})