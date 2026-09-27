import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Re-state vitest defaults with **/ globstar so nested node_modules (e.g. inside
    // a .worktrees/<branch>/) are also excluded. Plus .claude (subagent scratch),
    // .superpowers (brainstorm scratch), and .worktrees (git worktrees with their
    // own deps) so stale test files don't get discovered.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '.claude/**', '.superpowers/**', '.worktrees/**'],
    env: {
      // Test keyring: k1 = ENCRYPTION_KEY, writes v1:k1 (#1287). Since S3b
      // encrypt() throws without a write kid, so every environment that writes
      // — tests included — must set one.
      ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000001',
      ENCRYPTION_WRITE_KID: 'k1',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
