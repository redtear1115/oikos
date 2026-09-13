import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from './vitest.config'

// CI variant of the test run (`npm run test:ci`).
//
// `__tests__/actions/**`, `__tests__/queries-trips.test.ts` and
// `__tests__/queries-fuelLog.test.ts` are *integration*
// tests: they load `.env.local` themselves and talk to the real dev Supabase
// Postgres, throwing in `beforeAll` when `DATABASE_URL` is missing. That throw is
// deliberate — locally a silent skip would let DB regressions slip through — but
// GitHub Actions has neither `.env.local` nor a database, so they can only ever be
// red there. Exclude them in CI and keep `npm run test:run` (full suite, needs a
// DB) as the local command.
//
// `mergeConfig` concatenates arrays, so the base `exclude` list still applies.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [
        '__tests__/actions/**',
        '__tests__/queries-trips.test.ts',
        '__tests__/queries-fuelLog.test.ts',
      ],
    },
  }),
)
