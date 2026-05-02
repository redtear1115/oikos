import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Default vitest excludes node_modules + dist + .next; add .claude (subagent
    // worktrees live there) and .superpowers (brainstorm scratch) so stale test
    // files don't get discovered.
    exclude: ['node_modules', 'dist', '.next', '.claude/**', '.superpowers/**'],
    env: {
      ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000001',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
